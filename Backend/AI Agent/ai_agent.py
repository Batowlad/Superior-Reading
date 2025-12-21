from pathlib import Path
import json
import re
import os
import sys
from typing import Optional, TypedDict, List, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


# Directory containing scraped JSON files, resolved relative to this file
SCRAPED_DATA_DIR: Path = (
    Path(__file__).resolve().parent.parent / "chrome_extension" / "scraped_data"
)

# Accepts filenames like "@_2025-09-18_19-44-17.json" or "_2025-09-18_19-44-17.json"
FILENAME_REGEX = re.compile(r"^@?_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$")


def _find_latest_scraped_file(directory: Path) -> Optional[Path]:
    """Return the most recently modified scraped JSON file matching the pattern."""
    if not directory.exists():
        return None

    candidates = [
        path
        for path in directory.iterdir()
        if path.is_file() and FILENAME_REGEX.match(path.name)
    ]

    if not candidates:
        return None

    return max(candidates, key=lambda p: p.stat().st_mtime)


def _read_content_from_json(file_path: Path) -> str:
    """Read the "content" field from the given JSON file, or empty string if missing."""
    try:
        with file_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return str(data.get("content", ""))
        return ""
    except Exception:
        return ""


# Public variable: the text content of the most recent scraped file
_latest_file: Optional[Path] = _find_latest_scraped_file(SCRAPED_DATA_DIR)
page_content: str = _read_content_from_json(_latest_file) if _latest_file else ""




from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

# Initialize LLM - use environment variable if available
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize LLM (will be validated when first used)
llm = None
if OPENAI_API_KEY:
    llm = ChatOpenAI(
        model="gpt-4o-mini", 
        temperature=0.3, 
        api_key=OPENAI_API_KEY
    )
else:
    print("Warning: OPENAI_API_KEY not found. LLM operations will fail.", file=sys.stderr)

# Pydantic models for structured output
class AnalysisResult(BaseModel):
    theme: str
    mood: List[str]

class TaggedResult(BaseModel):
    tags: List[str]
    embedding_description: str

class MusicRecommendation(BaseModel):
    title: str
    artist: str
    match_reason: str

class MusicRecommendations(BaseModel):
    recommendations: List[MusicRecommendation]

class AgentState(TypedDict):
    page_content: str
    analysis_result: Optional[Dict[str, Any]]
    tagged_result: Optional[Dict[str, Any]]
    music_recommendations: Optional[Dict[str, Any]]

CONTENT_ANALYZER_PROMPT = """You are an AI assistant that analyzes written text and extracts its thematic and emotional characteristics for music matching.

Follow these rules:
- Always summarize the main theme in 2 to 5 words.
- Always list moods as an array of 1 to 4 words.
- Always return output strictly in JSON format with keys: "theme" and "mood".

---

### Examples

Input:
"A spaceship crew lands on a distant planet filled with hostile alien life. The air is toxic, and the crew must struggle to survive."
Output:
{{
  "theme": "sci-fi survival",
  "mood": ["tense", "mysterious", "dark"]
}}

Input:
"A young couple walks hand in hand through the park, laughing as cherry blossoms fall around them."
Output:
{{
  "theme": "romantic slice of life",
  "mood": ["joyful", "peaceful"]
}}

Input:
"A knight faces a dragon guarding an ancient treasure deep within a cave. The clash is fierce, and the stakes are life or death."
Output:
{{
  "theme": "fantasy adventure",
  "mood": ["epic", "intense", "dramatic"]
}}

---

Now analyze the following input:

{page_content}

"""


EMBEDDING_TAGGING_PROMPT = """You are an AI assistant that converts thematic and emotional descriptors into compact tags and structured embeddings for music matching.

Input JSON:
{analysis_result}

Task:
1. Extract the "theme" and "mood" fields.
2. Generate a short list of 3 to 6 descriptive tags that capture both theme and mood.
   - Tags should be lowercase, single or two-word labels (e.g., "dark fantasy", "romantic", "epic", "calm").
   - Tags must avoid redundancy.
3. Provide an "embedding_description" that is a short natural language sentence summarizing the theme and mood in a way that can be converted into a vector.
   - Example: "Epic and dramatic fantasy adventure with intense atmosphere."

Output strictly in JSON format:
{{
  "tags": ["tag1", "tag2", "tag3", ...],
  "embedding_description": "short sentence for embedding"
}}

---

### Example

Input JSON:
{{
  "theme": "fantasy adventure",
  "mood": ["epic", "intense", "dramatic"]
}}

Output:
{{
  "tags": ["fantasy adventure", "epic", "intense", "dramatic"],
  "embedding_description": "Epic and dramatic fantasy adventure with intense atmosphere."
}}
"""


MUSIC_SELECTOR_PROMPT = """You are an AI assistant that recommends music tracks or playlists based on thematic and emotional descriptors.

Input JSON:
{tagged_result}

Task:
1. Interpret the "tags" and "embedding_description".
2. Select or generate a list of 3–5 recommended songs or playlists that best match the theme and mood.
   - Each item must include: "title", "artist" (if known), and "match_reason".
   - If specific tracks are not available in the database, describe the type of music instead (e.g., "epic orchestral soundtrack with heavy percussion").
3. Ensure the style of music aligns strongly with the input descriptors.
4. Output strictly in JSON format with this schema:

{{
  "recommendations": [
    {{
      "title": "string",
      "artist": "string or 'unknown'",
      "match_reason": "string"
    }},
    ...
  ]
}}

---

### Example

Input JSON:
{{
  "tags": ["fantasy adventure", "epic", "intense", "dramatic"],
  "embedding_description": "Epic and dramatic fantasy adventure with intense atmosphere."
}}

Output:
{{
  "recommendations": [
    {{
      "title": "The Battle",
      "artist": "Harry Gregson-Williams",
      "match_reason": "Epic orchestral track with dramatic and intense mood, matching fantasy adventure theme."
    }},
    {{
      "title": "Dragon Rider",
      "artist": "Two Steps From Hell",
      "match_reason": "Epic trailer-style music with dramatic intensity fitting a fantasy adventure."
    }},
    {{
      "title": "Fantasy Adventure Soundtrack Mix",
      "artist": "unknown",
      "match_reason": "Curated orchestral mix with heroic and dramatic tones for fantasy settings."
    }}
  ]
}}
"""


# Spotify API integration
try:
    import spotipy
    from spotipy.oauth2 import SpotifyClientCredentials
    
    SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
    SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
    
    if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
        client_credentials_manager = SpotifyClientCredentials(
            client_id=SPOTIFY_CLIENT_ID,
            client_secret=SPOTIFY_CLIENT_SECRET
        )
        spotify = spotipy.Spotify(client_credentials_manager=client_credentials_manager)
    else:
        spotify = None
        print("Warning: Spotify credentials not found. Music search will use AI recommendations only.", file=sys.stderr)
except ImportError:
    spotify = None
    print("Warning: spotipy not installed. Install with: pip install spotipy", file=sys.stderr)


def search_spotify_tracks(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Search for tracks on Spotify based on a query string."""
    if not spotify:
        return []
    
    try:
        results = spotify.search(q=query, type='track', limit=limit)
        tracks = []
        for item in results['tracks']['items']:
            tracks.append({
                'title': item['name'],
                'artist': ', '.join([artist['name'] for artist in item['artists']]),
                'spotify_id': item['id'],
                'spotify_url': item['external_urls']['spotify'],
                'preview_url': item.get('preview_url'),
                'album': item['album']['name']
            })
        return tracks
    except Exception as e:
        print(f"Error searching Spotify: {e}", file=sys.stderr)
        return []


# LangGraph node functions
def content_analyzer_node(state: AgentState) -> Dict[str, Any]:
    """Analyze the page content and extract theme and mood."""
    content = state.get('page_content', '')
    if not content:
        return {"analysis_result": {"theme": "unknown", "mood": []}}
    
    prompt = CONTENT_ANALYZER_PROMPT.format(page_content=content)
    
    messages = [
        SystemMessage(content="You are a helpful assistant that analyzes text and returns JSON."),
        HumanMessage(content=prompt)
    ]
    
    # Use structured output to get JSON response
    result = llm.with_structured_output(AnalysisResult).invoke(messages)
    
    return {
        "analysis_result": {
            "theme": result.theme,
            "mood": result.mood
        }
    }


def tag_node(state: AgentState) -> Dict[str, Any]:
    """Convert analysis result into tags and embedding description."""
    analysis = state.get('analysis_result')
    if not analysis:
        return {"tagged_result": {"tags": [], "embedding_description": ""}}
    
    # Convert analysis to JSON string for the prompt
    analysis_json = json.dumps(analysis, indent=2)
    prompt = EMBEDDING_TAGGING_PROMPT.format(analysis_result=analysis_json)
    
    messages = [
        SystemMessage(content="You are a helpful assistant that converts analysis into tags and returns JSON."),
        HumanMessage(content=prompt)
    ]
    
    # Use structured output to get JSON response
    result = llm.with_structured_output(TaggedResult).invoke(messages)
    
    return {
        "tagged_result": {
            "tags": result.tags,
            "embedding_description": result.embedding_description
        }
    }


def music_selector_node(state: AgentState) -> Dict[str, Any]:
    """Search for music recommendations based on tags and embedding description."""
    tagged = state.get('tagged_result')
    if not tagged:
        return {"music_recommendations": {"recommendations": []}}
    
    # Convert tagged result to JSON string for the prompt
    tagged_json = json.dumps(tagged, indent=2)
    prompt = MUSIC_SELECTOR_PROMPT.format(tagged_result=tagged_json)
    
    messages = [
        SystemMessage(content="You are a helpful assistant that recommends music and returns JSON."),
        HumanMessage(content=prompt)
    ]
    
    # Get AI recommendations
    ai_recommendations = llm.with_structured_output(MusicRecommendations).invoke(messages)
    
    # Try to find actual Spotify tracks for the recommendations
    recommendations = []
    for rec in ai_recommendations.recommendations:
        # Search Spotify using the title and artist
        search_query = f"{rec.title} {rec.artist}"
        spotify_results = search_spotify_tracks(search_query, limit=1)
        
        if spotify_results:
            # Use the Spotify result if found
            spotify_track = spotify_results[0]
            recommendations.append({
                "title": spotify_track['title'],
                "artist": spotify_track['artist'],
                "match_reason": rec.match_reason,
                "spotify_id": spotify_track.get('spotify_id'),
                "spotify_url": spotify_track.get('spotify_url'),
                "preview_url": spotify_track.get('preview_url'),
                "album": spotify_track.get('album'),
                "source": "spotify"
            })
        else:
            # Fall back to AI recommendation
            recommendations.append({
                "title": rec.title,
                "artist": rec.artist,
                "match_reason": rec.match_reason,
                "source": "ai_recommendation"
            })
    
    # If no Spotify results, try searching with tags
    if not any(r.get('source') == 'spotify' for r in recommendations) and tagged.get('tags'):
        # Try searching with tags
        tag_query = ' '.join(tagged['tags'][:3])  # Use first 3 tags
        spotify_results = search_spotify_tracks(tag_query, limit=5)
        
        if spotify_results:
            # Replace recommendations with Spotify results
            recommendations = []
            for track in spotify_results:
                recommendations.append({
                    "title": track['title'],
                    "artist": track['artist'],
                    "match_reason": f"Found on Spotify matching tags: {', '.join(tagged['tags'])}",
                    "spotify_id": track.get('spotify_id'),
                    "spotify_url": track.get('spotify_url'),
                    "preview_url": track.get('preview_url'),
                    "album": track.get('album'),
                    "source": "spotify"
                })
    
    return {
        "music_recommendations": {
            "recommendations": recommendations
        }
    }


# Build the LangGraph workflow
def build_music_agent_graph():
    """Build and return the compiled LangGraph workflow."""
    builder = StateGraph(AgentState)
    
    # Add nodes
    builder.add_node("content_analyzer", content_analyzer_node)
    builder.add_node("tag", tag_node)
    builder.add_node("music_selector", music_selector_node)
    
    # Set entry point
    builder.set_entry_point("content_analyzer")
    
    # Add edges
    builder.add_edge("content_analyzer", "tag")
    builder.add_edge("tag", "music_selector")
    builder.add_edge("music_selector", END)
    
    # Compile the graph
    graph = builder.compile()
    return graph


# Create the graph instance
music_agent_graph = build_music_agent_graph()


def run_music_agent(content: Optional[str] = None) -> Dict[str, Any]:
    """
    Run the music agent workflow with the given content or page_content.
    
    Args:
        content: Optional content to analyze. If None, uses page_content.
    
    Returns:
        Final state with all results including music recommendations.
    """
    input_content = content if content is not None else page_content
    
    if not input_content:
        return {
            "error": "No content provided. Please provide content or ensure page_content is set."
        }
    
    initial_state = {
        "page_content": input_content,
        "analysis_result": None,
        "tagged_result": None,
        "music_recommendations": None
    }
    
    # Run the graph and collect all states
    final_state = initial_state.copy()
    for node_outputs in music_agent_graph.stream(initial_state):
        # Update final_state with outputs from each node
        for node_name, node_state in node_outputs.items():
            print(f"Node '{node_name}' completed", file=sys.stderr)
            final_state.update(node_state)
    
    return final_state



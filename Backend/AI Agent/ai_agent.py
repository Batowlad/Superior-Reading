from pathlib import Path
import json
import re
from typing import Optional


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
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3, api_key=OPENAI_API_KEY)



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
{
  "theme": "sci-fi survival",
  "mood": ["tense", "mysterious", "dark"]
}

Input:
"A young couple walks hand in hand through the park, laughing as cherry blossoms fall around them."
Output:
{
  "theme": "romantic slice of life",
  "mood": ["joyful", "peaceful"]
}

Input:
"A knight faces a dragon guarding an ancient treasure deep within a cave. The clash is fierce, and the stakes are life or death."
Output:
{
  "theme": "fantasy adventure",
  "mood": ["epic", "intense", "dramatic"]
}

---

Now analyze the following input:

{page_content}

"""


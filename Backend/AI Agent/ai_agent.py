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

Input:
{page_content}

Task:
1. Summarize the main theme of the text in a few words (e.g., "sci-fi exploration", "romantic drama", "dark fantasy").
2. Identify the mood(s) conveyed by the text (e.g., "tense", "calm", "mysterious", "epic", "joyful").
3. Output the result strictly in JSON format with the keys "theme" and "mood".

Output format example:
{
  "theme": "fantasy adventure",
  "mood": ["mysterious", "tense"]
}
"""
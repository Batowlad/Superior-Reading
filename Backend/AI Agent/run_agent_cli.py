#!/usr/bin/env python3
"""
CLI entry point for the music agent.
Takes content from stdin or command line argument and returns JSON recommendations.
"""

import sys
import json
import warnings
import traceback

# Suppress urllib3 OpenSSL warnings (compatibility issue with LibreSSL)
warnings.filterwarnings("ignore", category=UserWarning, module="urllib3")

# Suppress LangChain pydantic deprecation warnings (langchain-core internal usage)
warnings.filterwarnings("ignore", message=".*langchain_core.pydantic_v1.*", category=DeprecationWarning)

try:
    from ai_agent import run_music_agent
except ImportError as e:
    error_result = {
        "error": f"Failed to import ai_agent module: {str(e)}",
        "music_recommendations": {"recommendations": []},
        "hint": "Make sure all dependencies are installed: pip install -r requirements.txt"
    }
    print(json.dumps(error_result))
    sys.exit(1)
except Exception as e:
    error_result = {
        "error": f"Unexpected error during import: {str(e)}",
        "music_recommendations": {"recommendations": []},
        "traceback": traceback.format_exc()
    }
    print(json.dumps(error_result))
    sys.exit(1)

def main():
    """Main entry point for CLI."""
    # Read content from stdin or command line argument
    if len(sys.argv) > 1:
        # Content passed as command line argument
        content = sys.argv[1]
    else:
        # Read from stdin
        content = sys.stdin.read()
    
    if not content or not content.strip():
        error_result = {
            "error": "No content provided",
            "music_recommendations": {"recommendations": []}
        }
        print(json.dumps(error_result))
        sys.exit(1)
    
    # Run the agent
    try:
        result = run_music_agent(content.strip())
        
        # Extract only music_recommendations for the response
        # If there's an error, include it
        output = {
            "music_recommendations": result.get("music_recommendations", {"recommendations": []})
        }
        
        if "error" in result:
            output["error"] = result["error"]
        
        # Output as JSON
        print(json.dumps(output, indent=2))
        sys.exit(0)  # Explicit success exit
        
    except KeyboardInterrupt:
        error_result = {
            "error": "Process interrupted by user",
            "music_recommendations": {"recommendations": []}
        }
        print(json.dumps(error_result))
        sys.exit(130)  # Standard exit code for SIGINT
    except Exception as e:
        error_result = {
            "error": str(e),
            "error_type": type(e).__name__,
            "music_recommendations": {"recommendations": []},
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()

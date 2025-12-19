#!/usr/bin/env python3
"""
CLI entry point for the music agent.
Takes content from stdin or command line argument and returns JSON recommendations.
"""

import sys
import json
from ai_agent import run_music_agent

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
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "music_recommendations": {"recommendations": []}
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()

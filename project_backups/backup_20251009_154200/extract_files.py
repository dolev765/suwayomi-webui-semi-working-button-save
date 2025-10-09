#!/usr/bin/env python3
"""
File Content Extractor Script
Extracts and organizes the contents of key project files into a single text file.
"""

import os
import json
from pathlib import Path
from datetime import datetime

def read_file_content(file_path):
    """Read file content, handling encoding issues gracefully."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        try:
            with open(file_path, 'r', encoding='latin-1') as f:
                return f.read()
        except Exception as e:
            return f"ERROR: Could not read file - {e}"
    except FileNotFoundError:
        return f"ERROR: File not found - {file_path}"
    except Exception as e:
        return f"ERROR: {e}"

def redact_env_values(content):
    """Redact sensitive values from environment files."""
    if not content or content.startswith("ERROR:"):
        return content
    
    lines = content.split('\n')
    redacted_lines = []
    
    for line in lines:
        if '=' in line and not line.startswith('#'):
            # Redact the value part
            parts = line.split('=', 1)
            if len(parts) == 2:
                key = parts[0].strip()
                redacted_lines.append(f"{key}=[REDACTED]")
            else:
                redacted_lines.append(line)
        else:
            redacted_lines.append(line)
    
    return '\n'.join(redacted_lines)

def extract_files():
    """Main function to extract all specified files."""
    # Get the script directory (should be in Tachidesk webUI)
    script_dir = Path(__file__).parent
    
    # Define files to extract with their paths and descriptions
    files_to_extract = [
        {
            "path": script_dir / "package.json",
            "description": "package.json (current, after any edits)",
            "redact": False
        },
        {
            "path": script_dir / "vite.config.ts",
            "description": "vite.config.ts (current)",
            "redact": False
        },
        {
            "path": script_dir / ".env",
            "description": ".env (values redacted)",
            "redact": True
        },
        {
            "path": script_dir / ".env.local",
            "description": ".env.local (values redacted)",
            "redact": True
        },
        {
            "path": script_dir / ".env.development",
            "description": ".env.development (values redacted)",
            "redact": True
        },
        {
            "path": script_dir / "tsconfig.json",
            "description": "tsconfig.json",
            "redact": False
        },
        {
            "path": script_dir / "tsconfig.node.json",
            "description": "tsconfig.node.json (if present)",
            "redact": False
        },
        {
            "path": script_dir / "index.html",
            "description": "index.html",
            "redact": False
        },
        {
            "path": script_dir / "src" / "index.tsx",
            "description": "src/index.tsx (main entry point)",
            "redact": False
        },
        {
            "path": script_dir / "src" / "App.tsx",
            "description": "src/App.tsx",
            "redact": False
        }
    ]
    
    # Create output content
    output_lines = []
    output_lines.append("=" * 80)
    output_lines.append("TACHIDESK WEBUI PROJECT FILE CONTENTS EXTRACTION")
    output_lines.append("=" * 80)
    output_lines.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    output_lines.append(f"Project: Tachidesk WebUI")
    output_lines.append("=" * 80)
    output_lines.append("")
    
    # Extract each file
    for file_info in files_to_extract:
        file_path = file_info["path"]
        description = file_info["description"]
        should_redact = file_info["redact"]
        
        output_lines.append("-" * 60)
        output_lines.append(f"FILE: {description}")
        output_lines.append(f"PATH: {file_path}")
        output_lines.append("-" * 60)
        output_lines.append("")
        
        if file_path.exists():
            content = read_file_content(file_path)
            
            if should_redact:
                content = redact_env_values(content)
            
            output_lines.append(content)
        else:
            output_lines.append(f"FILE NOT FOUND: {file_path}")
        
        output_lines.append("")
        output_lines.append("")
    
    # Write to output file
    output_file = script_dir / "extracted_files_content.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output_lines))
    
    print(f"File contents extracted to: {output_file}")
    print(f"Total files processed: {len(files_to_extract)}")
    
    # Print summary
    print("\nFiles processed:")
    for file_info in files_to_extract:
        file_path = file_info["path"]
        description = file_info["description"]
        status = "✓" if file_path.exists() else "✗"
        print(f"  {status} {description}")

if __name__ == "__main__":
    extract_files()

# Markitdown-Obsidian

A plugin for [Obsidian](https://obsidian.md) that automatically converts various file types to Markdown using the [markitdown](https://github.com/lyc8503/markitdown) library.

## Features

- **External Folder Monitoring**
  - Monitor multiple external folders simultaneously
  - Custom folder aliases for organized output
  - Enable/disable individual folder monitoring
  - Preserves full directory structure in vault

- **Real-time File Operations**
  - Automatic file conversion on addition
  - Smart move/rename detection
  - Automatic file archiving
  - Duplicate detection and handling

- **Supported File Types**
  - PDF files
  - Word documents (.doc, .docx)
  - Excel spreadsheets (.xls, .xlsx)
  - PowerPoint presentations (.ppt, .pptx)
  - Text files (.txt)
  - HTML files (.html, .htm)
  - RTF files (.rtf)
  - ODT files (.odt)
  - ODS files (.ods)
  - ODP files (.odp)

- **Advanced Features**
  - Manual rescan capability
  - Global monitoring toggle
  - Detailed error handling and logging
  - File metadata preservation
  - Timestamp-based archiving

## Requirements

- Python 3.8 or higher
- markitdown package (`pip install markitdown`)
- Obsidian desktop app

### Checking Python Path

Before installing the markitdown package, make sure you're using the correct Python installation:

1. Open Terminal/Command Prompt
2. Run `which python` (Unix/Mac) or `where python` (Windows) to find your Python path
3. Use the full path when installing markitdown:
   ```bash
   /path/to/your/python -m pip install markitdown
   ```
4. Copy this path to the plugin's "Python Path" setting

## Installation

1. Install the markitdown package:
   ```bash
   pip install markitdown
   ```

2. Install this plugin in Obsidian:
   - Open Obsidian Settings
   - Go to Community Plugins
   - Click "Browse"
   - Search for "Markitdown"
   - Click Install
   - Enable the plugin

## Configuration

1. Open Obsidian Settings
2. Go to Community Plugins > Markitdown
3. Configure the following settings:
   - Python Path: Path to your Python executable
   - External Monitored Folders: Add folders to monitor
     - Set folder path
     - Configure folder alias (optional)
     - Enable/disable monitoring
   - Output Directory: Directory where converted files will be saved
   - Monitored File Types: Select which file types to monitor
   - Enable Plugins: Enable additional conversion features
   - Azure Document Intelligence Endpoint: Endpoint URL for Azure Document Intelligence (optional)
   - Azure Document Intelligence Key: API key for Azure Document Intelligence (optional)

## Usage

1. **Basic Usage**
   - Add files to monitored folders
   - Files are automatically converted to Markdown
   - Converted files appear in your vault with preserved directory structure

2. **Advanced Operations**
   - Move/rename files in monitored folders
   - Plugin automatically updates corresponding files in vault
   - Use "Rescan external monitored folders now" command for manual updates
   - Toggle global monitoring as needed

3. **File Management**
   - Duplicate files are handled with backlinks
   - Deleted files are archived with timestamps
   - Failed conversions create error placeholder files

## Troubleshooting

If you encounter any issues:

1. Check that Python is installed and accessible
2. Verify that the markitdown package is installed
3. Check the plugin settings
4. Check the Obsidian console for error messages
5. Verify folder permissions
6. Check log files for detailed error information

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Credits and Acknowledgments

- This plugin is a fork of [ethanolivertroy's obsidian-markitdown](https://github.com/ethanolivertroy/obsidian-markitdown) plugin
- Special thanks to [ethanolivertroy](https://github.com/ethanolivertroy) for creating the original Obsidian plugin
- Built on top of [Microsoft's markitdown](https://github.com/microsoft/markitdown) library
- Built on the [Obsidian Plugin System](https://github.com/obsidianmd/obsidian-api)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

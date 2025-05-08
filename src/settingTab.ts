import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MarkitdownPlugin from './main';
import { DEFAULT_SETTINGS } from './settings';

export class MarkitdownSettingTab extends PluginSettingTab {
    plugin: MarkitdownPlugin;

    constructor(app: App, plugin: MarkitdownPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Python path')
            .setDesc('Path to python executable (e.g., python, python3, or full path)')
            .addText(text => text
                .setPlaceholder('python')
                .setValue(this.plugin.settings.pythonPath)
                .onChange(async (value) => {
                    this.plugin.settings.pythonPath = value;
                    await this.plugin.saveSettings();
                    await this.plugin.checkDependencies();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Azure Document Intelligence endpoint')
            .setDesc('Optional: Azure Document Intelligence endpoint for improved document processing quality. Requires API key.')
            .addText(text => text
                .setPlaceholder('https://your-resource.cognitiveservices.azure.com/')
                .setValue(this.plugin.settings.docintelEndpoint)
                .onChange(async (value) => {
                    this.plugin.settings.docintelEndpoint = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Azure Document Intelligence Key')
            .setDesc('Optional: Azure Document Intelligence API key. Required if endpoint is set.')
            .addText(text => text
                .setPlaceholder('Enter your Azure Document Intelligence key')
                .setValue(this.plugin.settings.docintelKey)
                .onChange(async (value) => {
                    this.plugin.settings.docintelKey = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Output folder')
            .setDesc('Folder path for converted files (relative to vault root)')
            .addText(text => text
                .setPlaceholder('markitdown-output')
                .setValue(this.plugin.settings.outputDirectory)
                .onChange(async (value) => {
                    this.plugin.settings.outputDirectory = value.trim();
                    await this.plugin.saveSettings();
                }));

        // --- UI for External Folder Monitoring ---
        containerEl.createEl('h3', { text: 'External Folder Monitoring' });

        new Setting(containerEl)
            .setName('Enable real-time monitoring')
            .setDesc('Toggle real-time monitoring of external folders. When disabled, you can still use the manual rescan command.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.monitoringEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.monitoringEnabled = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        this.plugin.startExternalFolderMonitoring();
                    } else {
                        this.plugin.stopExternalFolderMonitoring();
                    }
                }));

        new Setting(containerEl)
            .setName('External folders to monitor')
            .setDesc('Add or remove full paths to external folders you want to monitor. You can set an alias for each folder and enable/disable monitoring.');

        (this.plugin.settings.externalMonitoredFolders || []).forEach((folder, index) => {
            const folderSetting = new Setting(containerEl);
            
            // Path input
            folderSetting
                .addText(text => text
                    .setValue(folder.path)
                    .setPlaceholder('/path/to/your/folder')
                    .onChange(async (value) => {
                        // Remove any surrounding quotes and trim
                        const cleanPath = value.replace(/^["']|["']$/g, '').trim();
                        this.plugin.settings.externalMonitoredFolders[index].path = cleanPath;
                        await this.plugin.saveSettings();
                        this.plugin.startExternalFolderMonitoring();
                    }));

            // Alias input
            folderSetting
                .addText(text => text
                    .setValue(folder.alias)
                    .setPlaceholder('Folder alias (optional)')
                    .onChange(async (value) => {
                        this.plugin.settings.externalMonitoredFolders[index].alias = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.startExternalFolderMonitoring();
                    }));

            // Enable/Disable toggle
            folderSetting
                .addToggle(toggle => toggle
                    .setValue(folder.enabled)
                    .onChange(async (value) => {
                        this.plugin.settings.externalMonitoredFolders[index].enabled = value;
                        await this.plugin.saveSettings();
                        this.plugin.startExternalFolderMonitoring();
                    }));

            // Remove button
            folderSetting
                .addButton(button => button
                    .setButtonText('-')
                    .setTooltip('Remove folder')
                    .onClick(async () => {
                        this.plugin.settings.externalMonitoredFolders.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.plugin.startExternalFolderMonitoring();
                        this.display();
                    }));
        });

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('+ Add Monitored Folder')
                .onClick(async () => {
                    if (!this.plugin.settings.externalMonitoredFolders) {
                        this.plugin.settings.externalMonitoredFolders = [];
                    }
                    this.plugin.settings.externalMonitoredFolders.push({
                        path: '',
                        alias: '',
                        enabled: true
                    });
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName('Vault output folder (for external monitoring)')
            .setDesc('Name of the folder IN YOUR VAULT where files from external monitoring will be saved (e.g., "ExternalConverted").')
            .addText(text => text
                .setPlaceholder('ExternalConverted')
                .setValue(this.plugin.settings.externalSourceOutputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.externalSourceOutputFolder = value.trim();
                    await this.plugin.saveSettings();
                    console.log('External source output folder set to:', this.plugin.settings.externalSourceOutputFolder);
                }));

        new Setting(containerEl)
            .setName('Monitored file types (for external folders)')
            .setDesc('Select which file types to process from the monitored external folders.');

        // Ensure monitoredFileTypes exists in settings
        if (!this.plugin.settings.monitoredFileTypes) {
            this.plugin.settings.monitoredFileTypes = { ...DEFAULT_SETTINGS.monitoredFileTypes };
        }

        Object.keys(DEFAULT_SETTINGS.monitoredFileTypes).forEach(ext => {
            new Setting(containerEl)
                .setName(ext.toUpperCase().substring(1))
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.monitoredFileTypes[ext] === true)
                    .onChange(async (value) => {
                        this.plugin.settings.monitoredFileTypes[ext] = value;
                        await this.plugin.saveSettings();
                    }));
        });

        // Status section
        new Setting(containerEl)
            .setName('Status')
            .setHeading();

        const statusContainer = containerEl.createDiv('markitdown-status-container');

        // Monitoring status
        const monitoringStatus = statusContainer.createDiv('markitdown-status-item');
        const monitoringIcon = monitoringStatus.createSpan();
        monitoringIcon.addClass('markitdown-status-icon');
        monitoringIcon.addClass(this.plugin.settings.monitoringEnabled ? 'success' : 'warning');
        monitoringIcon.setText(this.plugin.settings.monitoringEnabled ? '✓' : '⚠');
        monitoringStatus.createSpan().setText(`Monitoring: ${this.plugin.settings.monitoringEnabled ? 'Active' : 'Disabled'}`);

        // Python status
        const pythonStatus = statusContainer.createDiv('markitdown-status-item');

        const pythonIcon = pythonStatus.createSpan();
        pythonIcon.addClass('markitdown-status-icon');
        pythonIcon.addClass(this.plugin.pythonInstalled ? 'success' : 'error');
        pythonIcon.setText(this.plugin.pythonInstalled ? '✓' : '✗');

        pythonStatus.createSpan().setText(`Python: ${this.plugin.pythonInstalled ? 'Installed' : 'Not installed'}`);

        // Markitdown status
        const markitdownStatus = statusContainer.createDiv('markitdown-status-item');

        const markitdownIcon = markitdownStatus.createSpan();
        markitdownIcon.addClass('markitdown-status-icon');
        markitdownIcon.addClass(this.plugin.markitdownInstalled ? 'success' : 'error');
        markitdownIcon.setText(this.plugin.markitdownInstalled ? '✓' : '✗');

        markitdownStatus.createSpan().setText(`Markitdown: ${this.plugin.markitdownInstalled ? 'Installed' : 'Not installed'}`);

        // Install button if Markitdown is not installed
        if (!this.plugin.markitdownInstalled && this.plugin.pythonInstalled) {
            const installButton = containerEl.createEl('button', {
                text: 'Install Markitdown',
                cls: 'markitdown-install-button'
            });

            installButton.addEventListener('click', async () => {
                installButton.disabled = true;
                installButton.setText('Installing...');

                try {
                    const success = await this.plugin.installMarkitdown();

                    if (success) {
                        new Notice('Markitdown installed successfully!');
                        this.display();
                    } else {
                        new Notice('Failed to install Markitdown. Please check the console for errors.');
                        installButton.disabled = false;
                        installButton.setText('Try Again');
                    }
                } catch (error) {
                    console.error('Error installing Markitdown:', error);
                    new Notice(`Error: ${(error as Error).message}`);
                    installButton.disabled = false;
                    installButton.setText('Try Again');
                }
            });
        }

        // Add archive old converted files toggle
        new Setting(containerEl)
            .setName('Archive old converted files when source changes')
            .setDesc('If enabled, old converted files will be moved to the archive folder when the source file changes. If disabled, old files will remain in the output folder.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.archiveOldConvertedFiles)
                .onChange(async (value) => {
                    this.plugin.settings.archiveOldConvertedFiles = value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl('h3', { text: 'Logging Settings' });
        
        new Setting(containerEl)
            .setName('Enable Logging')
            .setDesc('Enable or disable logging')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.logging.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.logging.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Log File')
            .setDesc('Path to the log file relative to vault root')
            .addText(text => text
                .setPlaceholder('.markitdown/logs/markitdown.log')
                .setValue(this.plugin.settings.logging.logFile)
                .onChange(async (value) => {
                    this.plugin.settings.logging.logFile = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max Log Size')
            .setDesc('Maximum size of each log file in bytes (default: 5MB)')
            .addText(text => text
                .setPlaceholder('5242880')
                .setValue(this.plugin.settings.logging.maxLogSize.toString())
                .onChange(async (value) => {
                    const size = parseInt(value);
                    if (!isNaN(size) && size > 0) {
                        this.plugin.settings.logging.maxLogSize = size;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Max Log Files')
            .setDesc('Maximum number of log files to keep (default: 5)')
            .addText(text => text
                .setPlaceholder('5')
                .setValue(this.plugin.settings.logging.maxLogFiles.toString())
                .onChange(async (value) => {
                    const count = parseInt(value);
                    if (!isNaN(count) && count > 0) {
                        this.plugin.settings.logging.maxLogFiles = count;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Log Level')
            .setDesc('Minimum log level to record')
            .addDropdown(dropdown => dropdown
                .addOption('DEBUG', 'Debug')
                .addOption('INFO', 'Info')
                .addOption('WARN', 'Warning')
                .addOption('ERROR', 'Error')
                .setValue(this.plugin.settings.logging.logLevel)
                .onChange(async (value) => {
                    this.plugin.settings.logging.logLevel = value as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
                    await this.plugin.saveSettings();
                }));
    }
} 
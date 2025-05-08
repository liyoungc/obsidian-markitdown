export interface MonitoredFolder {
    path: string;
    alias: string;
    enabled: boolean;
}

export interface MarkitdownSettings {
    pythonPath: string;
    outputDirectory: string;
    monitoredFileTypes: {
        [key: string]: boolean;
    };
    docintelEndpoint: string;
    docintelKey: string;
    externalMonitoredFolders: MonitoredFolder[];
    externalSourceOutputFolder: string;
    monitoringEnabled: boolean;
    archiveOldConvertedFiles: boolean;
    logging: {
        enabled: boolean;
        logFile: string;
        maxLogSize: number;
        maxLogFiles: number;
        logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    };
}

export const DEFAULT_SETTINGS: MarkitdownSettings = {
    pythonPath: 'python',
    outputDirectory: 'markitdown-output',
    monitoredFileTypes: {
        '.pdf': true,
        '.doc': true,
        '.docx': true,
        '.xls': true,
        '.xlsx': true,
        '.ppt': true,
        '.pptx': true,
        '.txt': true,
        '.html': true,
        '.htm': true,
        '.rtf': true,
        '.odt': true,
        '.ods': true,
        '.odp': true
    },
    docintelEndpoint: '',
    docintelKey: '',
    externalMonitoredFolders: [],
    externalSourceOutputFolder: 'ExternalConverted',
    monitoringEnabled: true,
    archiveOldConvertedFiles: true,
    logging: {
        enabled: true,
        logFile: '.markitdown/logs/markitdown.log',
        maxLogSize: 5 * 1024 * 1024, // 5MB
        maxLogFiles: 5,
        logLevel: 'INFO'
    }
}; 
/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    openMarksFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
    showOpenDialog: () => Promise<string | null>
    readExcel: (filePath: string) => Promise<{ success: boolean; data?: any[][]; error?: string }>
    startCheck: (data: any[][], config: any, filePath?: string) => Promise<{ success: boolean; fileName?: string }>
    getCurrentRow: () => Promise<{ index: number; row: any[]; config?: any } | null>
    nextRow: () => Promise<{ success: boolean; index?: number; row?: any[]; config?: any; finished?: boolean }>
    copyToClipboard: (text: string) => Promise<{ success: boolean }>
    openNoteWindow: (rowData: any[], rowIndex: number) => Promise<{ success: boolean }>
    getPendingMarkData: () => Promise<{ rowData: any[]; rowIndex: number } | null>
    markRow: (rowData: any[], note: string, rowIndex: number) => Promise<{ success: boolean; error?: string }>
    unmarkRow: (rowIndex: number) => Promise<{ success: boolean; error?: string }>
    checkRowMarked: (rowIndex: number) => Promise<{ marked: boolean; note: string }>
    closeNoteWindow: () => Promise<{ success: boolean }>
    onNoteWindowClosed: (callback: () => void) => void
    windowMinimize: () => Promise<void>
    windowMaximize: () => Promise<void>
    windowClose: () => Promise<void>
    windowIsMaximized: () => Promise<boolean>
    endCheck: () => Promise<{
      startIndex: number
      endIndex: number
      duration: number
      markedCount: number
    }>
    getLastCheckResult: () => Promise<{
      startIndex: number
      endIndex: number
      duration: number
      markedCount: number
    } | null>
    closeCheckWindow: () => Promise<void>
    onNextRow: (callback: () => void) => void
    checkExtensionConnection: () => Promise<{ connected: boolean }>
    sendToExtension: (message: any) => Promise<void>
    waitForExtensionMessage: (timeout: number, expectedType?: string) => Promise<any>
    openBrowserUrl: (url: string) => Promise<void>
    openMarksFolder: () => Promise<{ success: boolean; path?: string; error?: string }>
    updateGlobalShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>
    getGlobalShortcut: () => Promise<{ success: boolean; shortcut?: string }>
  }
}


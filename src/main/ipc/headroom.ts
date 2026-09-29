import { ipcMain } from 'electron'
import { isHeadroomInstalled, readHeadroomSavings } from '../headroom/headroom-savings-probe'
import type { HeadroomSavings } from '../../shared/headroom-savings'

export function registerHeadroomHandlers(): void {
  ipcMain.handle('headroom:getSavings', async (): Promise<HeadroomSavings | null> =>
    readHeadroomSavings()
  )
  ipcMain.handle('headroom:isInstalled', async (): Promise<boolean> => isHeadroomInstalled())
}

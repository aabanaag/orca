import { ipcMain } from 'electron'
import { readHeadroomSavings } from '../headroom/headroom-savings-probe'
import type { HeadroomSavings } from '../../shared/headroom-savings'

export function registerHeadroomHandlers(): void {
  ipcMain.handle('headroom:getSavings', async (): Promise<HeadroomSavings | null> =>
    readHeadroomSavings()
  )
}

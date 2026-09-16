import { ipcRenderer } from 'electron'
import type { HeadroomApi } from './headroom-api'

export const headroomApi: HeadroomApi = {
  getSavings: () => ipcRenderer.invoke('headroom:getSavings')
}

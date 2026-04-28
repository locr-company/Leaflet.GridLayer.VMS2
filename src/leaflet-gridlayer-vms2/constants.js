export const EARTH_EQUATORIAL_RADIUS_METERS = 6378137
export const EARTH_EQUATORIAL_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_EQUATORIAL_RADIUS_METERS

export const TILE_AREA_DRAWING_EXTENSION = 1
export const TILE_AREA_SAVE_EXTENSION = 0.25

export const DEFAULT_PRINT_DPI = 300

export const DEFAULT_ZOOM_POWER_BASE = 2
export const DEFAULT_STYLE_ID = '4201'

export const DEFAULT_STYLE_URL = 'https://vms2.locr.com/api/style/{style_id}'
export const DEFAULT_TILE_URL = 'https://vms2.locr.com/api/tile/{z}/{y}/{x}?k={key}&v={value}&t={type}'
export const DEFAULT_ASSETS_URL = 'https://vms2.locr.com/api/styles/assets'

export const DEFAULT_MIN_NUMBER_OF_WORKERS = 6
export const DEFAULT_TILE_CANVAS_POOL_SIZE = 64
export const DEFAULT_SAVE_DATA_CANVAS_POOL_SIZE = 8

export const DEVICE_PIXEL_RATIO = globalThis.devicePixelRatio || 1

export const DEFAULT_OPTIONS = {
  zoomPowerBase: DEFAULT_ZOOM_POWER_BASE,
  style: DEFAULT_STYLE_ID,
  styleUrl: DEFAULT_STYLE_URL,
  tileUrl: DEFAULT_TILE_URL,
  assetsUrl: DEFAULT_ASSETS_URL,
  accessKey: '',
  mapScale: 1,
  objectScale: 1,
  detailOffset: 0,
  zoomRangeOffset: 0,
  styleOverride: {},
  tileCanvasPoolSize: DEFAULT_TILE_CANVAS_POOL_SIZE,
  saveDataCanvasPoolSize: DEFAULT_SAVE_DATA_CANVAS_POOL_SIZE,
  zoomOffset: 0
}

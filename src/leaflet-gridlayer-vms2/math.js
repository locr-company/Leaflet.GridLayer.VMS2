import {
  DEFAULT_ZOOM_POWER_BASE,
  EARTH_EQUATORIAL_CIRCUMFERENCE_METERS,
  EARTH_EQUATORIAL_RADIUS_METERS
} from './constants.js'

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

const mathMethods = {
  _latitudeToMeters: function (latitude) {
    return Math.log(Math.tan((90 + latitude) * Math.PI / 360)) * EARTH_EQUATORIAL_RADIUS_METERS
  },

  _longitudeToMeters: function (longitude) {
    return longitude * EARTH_EQUATORIAL_RADIUS_METERS * Math.PI / 180
  },

  _latitudeToTile: function (latitude, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (Math.log(Math.tan((90 - latitude) * Math.PI / 360)) / (2 * Math.PI) + 0.5) * Math.pow(base, z)
  },

  _longitudeToTile: function (longitude, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (longitude + 180) * Math.pow(base, z) / 360
  },

  _tileToLatitude: function (y, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return 90 - Math.atan(Math.exp((y / Math.pow(base, z) - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  },

  _tileToLongitude: function (x, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return x * 360 / Math.pow(base, z) - 180
  },

  _tileXToMeters: function (x, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (x / Math.pow(base, z) - 0.5) * EARTH_EQUATORIAL_CIRCUMFERENCE_METERS
  },

  _tileYToMeters: function (y, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (0.5 - y / Math.pow(base, z)) * EARTH_EQUATORIAL_CIRCUMFERENCE_METERS
  },

  _latitudeToNormalized: function (latitude) {
    return Math.log(Math.tan((90 - latitude) * Math.PI / 360)) / (2 * Math.PI) + 0.5
  },

  _longitudeToNormalized: function (longitude) {
    return (longitude + 180) / 360
  },

  _normalizedToLatitude: function (y) {
    return 90 - Math.atan(Math.exp((y - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  },

  _normalizedToLongitude: function (x) {
    return x * 360 - 180
  },

  _hexify8: function (value) {
    return HEX[value & 255]
  },

  _hexify16: function (values) {
    return HEX[values[0] & 255] + HEX[values[1] & 255]
  },

  _hexify24: function (values) {
    return HEX[values[0] & 255] + HEX[values[1] & 255] + HEX[values[2] & 255]
  },

  _hexify32: function (values) {
    return HEX[values[0] & 255] + HEX[values[1] & 255] + HEX[values[2] & 255] + HEX[values[3] & 255]
  },

  _getWorkerURL: function (url) {
    const content = `importScripts("${url}");`

    return URL.createObjectURL(new Blob([content], { type: 'text/javascript' }))
  }
}

export default mathMethods

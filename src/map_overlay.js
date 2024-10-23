export class MapOverlay {
  mapParameters = {}

  haversineDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371
    const φ1 = lat1 * Math.PI / 180 // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    const d = R * c

    return d
  }

  latitudeToNormalized(latitude) {
    return Math.log(Math.tan((90 - latitude) * Math.PI / 360)) / (2 * Math.PI) + 0.5
  }

  longitudeToNormalized(longitude) {
    return (longitude + 180) / 360
  }

  normalizedToLatitude(y) {
    return 90 - Math.atan(Math.exp((y - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  }

  normalizedToLongitude(x) {
    return x * 360 - 180
  }

  tileToLatitude(y, z) {
    return 90 - Math.atan(Math.exp((y / (1 << z) - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  }

  tileToLongitude(x, z) {
    return x * 360 / (1 << z) - 180
  }

  constructor(mapInfo) {
    this.mapParameters.latitudeMin = mapInfo.latitudeMin
    this.mapParameters.latitudeMax = mapInfo.latitudeMax
    this.mapParameters.longitudeMin = mapInfo.longitudeMin
    this.mapParameters.longitudeMax = mapInfo.longitudeMax

    this.mapParameters.width = mapInfo.width
    this.mapParameters.height = mapInfo.height
  }
}

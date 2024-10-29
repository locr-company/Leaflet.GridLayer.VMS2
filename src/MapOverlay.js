class MapOverlay {
  mapParameters = {}

  layers = []

  svgSource = ''

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
    if (isNaN(mapInfo.latitudeMin) || isNaN(mapInfo.latitudeMax) || isNaN(mapInfo.longitudeMin) || isNaN(mapInfo.longitudeMax) || isNaN(mapInfo.width) || isNaN(mapInfo.height) || isNaN(mapInfo.dpi)) {
      throw new ReferenceError('missing essential parameters')
    }

    this.mapParameters.latitudeMin = mapInfo.latitudeMin
    this.mapParameters.latitudeMax = mapInfo.latitudeMax
    this.mapParameters.longitudeMin = mapInfo.longitudeMin
    this.mapParameters.longitudeMax = mapInfo.longitudeMax

    this.mapParameters.width = mapInfo.width
    this.mapParameters.height = mapInfo.height

    this.mapParameters.dpi = mapInfo.dpi

    const degreesWidth = this.mapParameters.longitudeMax - this.mapParameters.longitudeMin

    const normalizedWidth = degreesWidth / 360
    const normalizedHeight = this.latitudeToNormalized(this.mapParameters.latitudeMin) - this.latitudeToNormalized(this.mapParameters.latitudeMax)

    const normalizedRatio = normalizedWidth / normalizedHeight
    const mapRatio = this.mapParameters.width / this.mapParameters.height

    if (mapRatio >= normalizedRatio) {
      this.mapParameters.longitudeMin -= (degreesWidth * mapRatio / normalizedRatio - degreesWidth) / 2
      this.mapParameters.longitudeMax += (degreesWidth * mapRatio / normalizedRatio - degreesWidth) / 2
    } else {
      let normalizedMin = this.latitudeToNormalized(this.mapParameters.latitudeMin)
      let normalizedMax = this.latitudeToNormalized(this.mapParameters.latitudeMax)

      normalizedMin += (normalizedWidth / mapRatio - normalizedHeight) / 2
      normalizedMax -= (normalizedWidth / mapRatio - normalizedHeight) / 2

      this.mapParameters.latitudeMin = this.normalizedToLatitude(normalizedMin)
      this.mapParameters.latitudeMax = this.normalizedToLatitude(normalizedMax)
    }

    // Prepare text clipping area

    const totalPixels = this.mapParameters.width * 360 / (this.mapParameters.longitudeMax - this.mapParameters.longitudeMin)

    this.mapParameters.latitudeMin = this.normalizedToLatitude(this.latitudeToNormalized(this.mapParameters.latitudeMin) + this.mapParameters.borderBottom / totalPixels)
    this.mapParameters.latitudeMax = this.normalizedToLatitude(this.latitudeToNormalized(this.mapParameters.latitudeMax) - this.mapParameters.borderTop / totalPixels)
    this.mapParameters.longitudeMin = this.normalizedToLongitude(this.longitudeToNormalized(this.mapParameters.longitudeMin) - this.mapParameters.borderLeft / totalPixels)
    this.mapParameters.longitudeMax = this.normalizedToLongitude(this.longitudeToNormalized(this.mapParameters.longitudeMax) + this.mapParameters.borderRight / totalPixels)
  }

  add(mapOverlayLayer) {
    this.svgSource = mapOverlayLayer.svgSource
  }

  getOverlay() {
    return this.svgSource
  }
}

class MapOverlayLayer{
  svgSource = ''

  constructor(svgSource) {
    this.svgSource = svgSource
  }
}

class SvgMapOverlayLayer extends MapOverlayLayer{
  constructor(svgSource) {
    super(svgSource)
  }
}

export { MapOverlay, SvgMapOverlayLayer }

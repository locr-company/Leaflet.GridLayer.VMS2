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

    decodePolyline(encoded, precision = 5) {
        const coordinates = []

        let index = 0
        let lat = 0.0
        let lng = 0.0
        let shift = 0
        let result = 0
        let byte = 0
        let latitudeChange = 0.0
        let longitudeChange = 0.0
        const factor = Math.pow(10, precision)

        const strLength = encoded.length

        while (index < strLength) {
            byte = 0
            shift = 0
            result = 0

            do {
                byte = encoded.charCodeAt(index) - 63
                index++
                result |= (byte & 0x1f) << shift
                shift += 5
            } while (byte >= 0x20)

            latitudeChange = ((result & 1) ? ~(result >> 1) : (result >> 1))

            shift = result = 0

            do {
                byte = encoded.charCodeAt(index) - 63
                index++
                result |= (byte & 0x1f) << shift
                shift += 5
            } while (byte >= 0x20)

            longitudeChange = ((result & 1) ? ~(result >> 1) : (result >> 1))

            lat += latitudeChange
            lng += longitudeChange

            const point = [
                lat / factor,
                lng / factor
            ]

            coordinates.push(point)
        }

        return coordinates
    }

    constructor(tileInfo) {
        let urlSearchParams = new URL(tileInfo.overlayImageUrlParameters, location.href).searchParams

        // Essentials

        this.mapParameters.latitudeMin = parseFloat(urlSearchParams.get('latitude_min')) || tileInfo.latitudeMin
        this.mapParameters.latitudeMax = parseFloat(urlSearchParams.get('latitude_max')) || tileInfo.latitudeMax
        this.mapParameters.longitudeMin = parseFloat(urlSearchParams.get('longitude_min')) || tileInfo.longitudeMin
        this.mapParameters.longitudeMax = parseFloat(urlSearchParams.get('longitude_max')) || tileInfo.longitudeMax

        this.mapParameters.width = parseFloat(urlSearchParams.get('width')) || tileInfo.width
        this.mapParameters.height = parseFloat(urlSearchParams.get('height')) || tileInfo.height

        // Border

        this.mapParameters.border = parseFloat(urlSearchParams.get('border')) || 0
        this.mapParameters.borderLeft = parseFloat(urlSearchParams.get('border_left')) || this.mapParameters.border
        this.mapParameters.borderRight = parseFloat(urlSearchParams.get('border_right')) || this.mapParameters.border
        this.mapParameters.borderTop = parseFloat(urlSearchParams.get('border_top')) || this.mapParameters.border
        this.mapParameters.borderBottom = parseFloat(urlSearchParams.get('border_bottom')) || this.mapParameters.border

        // Process map parameters

        // Fix the geographic bounds to match the map size

        let degreesWidth = this.mapParameters.longitudeMax - this.mapParameters.longitudeMin

        let normalizedWidth = degreesWidth / 360
        let normalizedHeight = this.latitudeToNormalized(this.mapParameters.latitudeMin) - this.latitudeToNormalized(this.mapParameters.latitudeMax)

        let normalizedRatio = normalizedWidth / normalizedHeight
        let mapRatio = this.mapParameters.width / this.mapParameters.height

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

        let totalPixels = this.mapParameters.width * 360 / (this.mapParameters.longitudeMax - this.mapParameters.longitudeMin)

        this.mapParameters.latitudeMin = this.normalizedToLatitude(this.latitudeToNormalized(this.mapParameters.latitudeMin) + this.mapParameters.borderBottom / totalPixels)
        this.mapParameters.latitudeMax = this.normalizedToLatitude(this.latitudeToNormalized(this.mapParameters.latitudeMax) - this.mapParameters.borderTop / totalPixels)
        this.mapParameters.longitudeMin = this.normalizedToLongitude(this.longitudeToNormalized(this.mapParameters.longitudeMin) - this.mapParameters.borderLeft / totalPixels)
        this.mapParameters.longitudeMax = this.normalizedToLongitude(this.longitudeToNormalized(this.mapParameters.longitudeMax) + this.mapParameters.borderRight / totalPixels)

        this.mapParameters.width += this.mapParameters.borderLeft + this.mapParameters.borderRight
        this.mapParameters.height += this.mapParameters.borderTop + this.mapParameters.borderBottom

        // Primitives

        this.primitivesScale = 1

        try {
            this.mapParameters.primitives = { polylines: [], lines: [], icons: [], texts: [] }

            for (let index = 0; index < 1000; index++) {
                let drawPolylineParameter = urlSearchParams.get('draw_polyline_' + index)

                if (drawPolylineParameter) {
                    if (drawPolylineParameter[0] == '{') {
                        let polylineJson = JSON.parse(drawPolylineParameter)

                        let polyline = {
                            width: polylineJson.width * this.primitivesScale || 5,
                            color: polylineJson.color || 'black',
                            alpha: polylineJson.transparency ? (100 - polylineJson.transparency) / 100 : 1,
                            polyline: this.decodePolyline(polylineJson.polyline),
                            dashes: []
                        }

                        if (polylineJson.dash_array) {
                            let dashes = polylineJson.dash_array.split(' ')

                            for (let dash of dashes) {
                                polyline.dashes.push(parseFloat(dash) * this.primitivesScale)
                            }
                        }

                        if (polylineJson.outline_width) {
                            polyline.outline_width = polylineJson.outline_width * this.primitivesScale
                            polyline.outline_color = polylineJson.outline_color || 'black'
                        }

                        this.mapParameters.primitives.polylines.push(polyline)
                    } else {
                        let polylineParameters = drawPolylineParameter.split(',')

                        if (polylineParameters.length < 7) {
                            return reject()
                        }

                        let polyline = {
                            width: parseFloat(polylineParameters[0]) * this.primitivesScale,
                            color: new L.Color(polylineParameters[1]),
                            alpha: parseFloat(polylineParameters[2]),
                            polyline: [],
                            dashes: []
                        }

                        for (let i = 3; i < polylineParameters.length; i += 2) {
                            polyline.polyline.push([
                                parseFloat(polylineParameters[i]),
                                parseFloat(polylineParameters[i + 1])
                            ])
                        }

                        if (polylineParameters[3]) {
                            let dashes = polylineParameters[3].split(' ')

                            for (let dash of dashes) {
                                polyline.dashes.push(parseFloat(dash) * this.primitivesScale)
                            }
                        }

                        this.mapParameters.primitives.polylines.push(polyline)
                    }
                }

                let lineParameter = urlSearchParams.get('line_' + index)

                if (lineParameter) {
                    let Line = {}

                    let Parameters = lineParameter.split(';')

                    for (let Parameter of Parameters) {
                        let Match = Parameter.match(/([^:]+):(.+)/)

                        Line[Match[1]] = Match[2]
                    }

                    this.mapParameters.primitives.lines.push(Line)
                }

                let iconParameter = urlSearchParams.get('icon_' + index)

                if (iconParameter) {
                    let icon = {}

                    let parameters = iconParameter.split(';')

                    for (let parameter of parameters) {
                        let match = parameter.match(/([^:]+):(.+)/)

                        icon[match[1]] = match[2]
                    }

                    icon.LN = parseFloat(icon.LN || '0')
                    icon.LT = parseFloat(icon.LT || '0')
                    icon.X = parseFloat(icon.X || '0') * this.primitivesScale
                    icon.Y = parseFloat(icon.Y || '0') * this.primitivesScale
                    icon.X2 = parseFloat(icon.X2 || '0') * this.primitivesScale
                    icon.Y2 = parseFloat(icon.Y2 || '0') * this.primitivesScale
                    icon.W = parseFloat(icon.W || '0') * this.primitivesScale
                    icon.H = parseFloat(icon.H || '0') * this.primitivesScale
                    icon.L = parseFloat(icon.L || '0') * this.primitivesScale
                    icon.T = parseFloat(icon.T || '0') * this.primitivesScale
                    icon.IBR = parseFloat(icon.IBR || '0') * this.primitivesScale
                    icon.IBC = icon.IBC == 'none' ? 'rgba(0,0,0,0)' : (icon.IBC || 'rgba(0,0,0,0)')
                    icon.IFC = icon.IFC == 'none' ? 'rgba(0,0,0,0)' : (icon.IFC || 'rgba(0,0,0,0)')
                    icon.IBW = parseFloat(icon.IBW || '0') * this.primitivesScale
                    icon.AT = parseFloat(icon.AT || '0')
                    icon.IBP = parseFloat(icon.IBP || '0')

                    this.mapParameters.primitives.icons.push(icon)
                }

                let textParameter = urlSearchParams.get('text_' + index)

                if (textParameter) {
                    let text = {}

                    let Parameters = textParameter.split(';')

                    for (let Parameter of Parameters) {
                        let KeyAndValue = Parameter.split(':')

                        text[KeyAndValue[0]] = KeyAndValue[1]
                    }

                    this.mapParameters.primitives.texts.push(text)
                }
            }

            // Scale bar

            if (urlSearchParams.get('draw_scale_bar') == '1') {
                this.mapParameters.scaleBar = {
                    x: parseFloat(urlSearchParams.get('scale_bar_x') || '100'),
                    y: parseFloat(urlSearchParams.get('scale_bar_y') || '100'),
                    anchor: parseInt(urlSearchParams.get('scale_bar_anchor') || '3'),
                    width: parseFloat(urlSearchParams.get('scale_bar_width') || '500'),
                    offset: parseFloat(urlSearchParams.get('scale_bar_offset') || '100'),
                    scale: parseFloat(urlSearchParams.get('scale_bar_scale') || '1'),
                    font: urlSearchParams.get('scale_bar_font') || 'Arial',
                    type: parseInt(urlSearchParams.get('scale_bar_type') || '0')
                }
            }

            // Watermark

            if (urlSearchParams.get('watermark_text')) {
                this.mapParameters.watermark = {
                    text: decodeURIComponent(urlSearchParams.get('watermark_text')),
                    font: urlSearchParams.get('watermark_font') || 'Arial',
                    opacity: parseFloat(urlSearchParams.get('watermark_opacity') || '0.2')
                }
            }

            // Copyright

            this.mapParameters.copyright = {
                text: decodeURIComponent(urlSearchParams.get('copyright_text') || ''),
                font: urlSearchParams.get('copyright_font') || 'Arial',
                x: parseFloat(urlSearchParams.get('copyright_x') || '10'),
                y: parseFloat(urlSearchParams.get('copyright_y') || '10'),
                anchor: parseInt(urlSearchParams.get('copyright_anchor') || '1'),
                size: parseFloat(urlSearchParams.get('copyright_size') || '20'),
            }
        } catch (exception) {
            console.error(exception)
        }
    }

    getScaleBarData() {
        if (!this.mapParameters.scaleBar) {
            return null
        }

        let resizeFactor = 1

        if (this.mapParameters.dpi) {
            resizeFactor = this.mapParameters.dpi / 300
        }

        let outerSize = 15.0 * this.mapParameters.scaleBar.scale

        let data = {
            font: {
                family: this.mapParameters.scaleBar.font
            },
            position: {
                x: this.mapParameters.scaleBar.x * resizeFactor,
                y: this.mapParameters.scaleBar.y * resizeFactor
            },
            offset: this.mapParameters.scaleBar.offset * resizeFactor,
            lineCap: (this.mapParameters.scaleBar.type == 1) ? 'round' : 'butt',
            km: {
                x: 0,
                y: 0,
                width: 0,
                text: '',
                textPosition: {
                    x: 0,
                    y: 0
                }
            },
            mi: {
                x: 0,
                y: 0,
                width: 0,
                text: '',
                textPosition: {
                    x: 0,
                    y: 0
                }
            },
            type: this.mapParameters.scaleBar.type,
            innerSize: 3.0 * this.mapParameters.scaleBar.scale * resizeFactor,
            outerSize: outerSize * resizeFactor,
            tailSize: 8.0 * this.mapParameters.scaleBar.scale * resizeFactor,
            strokeWidth: outerSize * 2 / 5 * resizeFactor,
            textAlign: this.mapParameters.scaleBar.anchor > 1 ? 'right' : 'left',
            textBaseline: 'bottom'
        }

        if (data.type === 1) {
            data.textAlign = 'center'
            data.textBaseline = 'middle'
        }

        if (this.mapParameters.scaleBar.anchor == 1 || this.mapParameters.scaleBar.anchor == 3) {
            data.position.y = -data.position.y
            data.offset = -data.offset
        }

        if (this.mapParameters.scaleBar.anchor == 2 || this.mapParameters.scaleBar.anchor == 3) {
            data.position.x = -data.position.x
        }

        let scaleBarAnchorX = 0
        let scaleBarAnchorY = 0

        switch (this.mapParameters.scaleBar.anchor) {
            case 0:
                scaleBarAnchorX = this.mapParameters.borderLeft
                scaleBarAnchorY = this.mapParameters.borderTop
                break

            case 1:
                scaleBarAnchorX = this.mapParameters.borderLeft
                scaleBarAnchorY = this.mapParameters.height - this.mapParameters.borderBottom
                break

            case 2:
                scaleBarAnchorX = this.mapParameters.width - this.mapParameters.borderRight
                scaleBarAnchorY = this.mapParameters.borderTop
                break

            case 3:
                scaleBarAnchorX = this.mapParameters.width - this.mapParameters.borderRight
                scaleBarAnchorY = this.mapParameters.height - this.mapParameters.borderBottom
                break
        }

        let kmDistance = this.haversineDistanceInKm((this.mapParameters.latitudeMin + this.mapParameters.latitudeMax) / 2, this.mapParameters.longitudeMin, (this.mapParameters.latitudeMin + this.mapParameters.latitudeMax) / 2, this.mapParameters.longitudeMax)

        // Kilometer

        let kmScaleList = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0]

        let index = 0
        let kmScaleLength = kmScaleList[0]

        while (kmScaleList[index] > kmDistance * this.mapParameters.scaleBar.width / this.mapParameters.width) {
            index++
        }

        kmScaleLength = kmScaleList[index]

        // Miles

        const kilometerPerMile = 1.609344
        const meterPerKilometer = 1000
        const feetPerMile = 5280

        let miScaleList = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 5000.5 / feetPerMile, 2000.5 / feetPerMile, 1000.5 / feetPerMile, 500.5 / feetPerMile, 200.5 / feetPerMile, 100.5 / feetPerMile, 50.5 / feetPerMile, 20.5 / feetPerMile, 10.5 / feetPerMile, 5.5 / feetPerMile, 2.5 / feetPerMile, 1.5 / feetPerMile, 0]

        index = 0
        let miScaleLength = miScaleList[0]

        while (miScaleList[index] * kilometerPerMile > kmDistance * this.mapParameters.scaleBar.width / this.mapParameters.width) {
            index++
        }

        miScaleLength = miScaleList[index]

        // Prepare scale bar position
        data.km.x = scaleBarAnchorX + data.position.x
        data.km.y = scaleBarAnchorY + data.position.y
        data.km.width = this.mapParameters.width * kmScaleLength / kmDistance

        if (this.mapParameters.scaleBar.anchor == 2 || this.mapParameters.scaleBar.anchor == 3) {
            data.km.width = -data.km.width
        }

        data.mi.x = data.km.x
        data.mi.y = data.km.y + data.offset * this.mapParameters.scaleBar.scale
        data.mi.width = this.mapParameters.width * miScaleLength * kilometerPerMile / kmDistance

        if (this.mapParameters.scaleBar.anchor == 2 || this.mapParameters.scaleBar.anchor == 3) {
            data.mi.width = -data.mi.width
        }

        data.km.text = Math.floor(kmScaleLength < 1 ? kmScaleLength * meterPerKilometer : kmScaleLength) + ' ' + (kmScaleLength < 1 ? 'm' : 'km')
        data.mi.text = Math.floor(miScaleLength < 1 ? miScaleLength * feetPerMile : miScaleLength) + ' ' + (miScaleLength < 1 ? 'ft' : 'mi')

        if (data.type === 1) {
            data.km.textPosition.x = data.km.x + data.km.width / 2
            data.km.textPosition.y = data.km.y - data.tailSize * 4
            data.mi.textPosition.x = data.mi.x + data.mi.width / 2
            data.mi.textPosition.y = data.km.y + data.tailSize * 4
        } else {
            data.km.textPosition.x = data.km.x
            data.km.textPosition.y = data.km.y - data.tailSize * 2
            data.mi.textPosition.x = data.mi.x
            data.mi.textPosition.y = data.mi.y - data.tailSize * 2
        }

        return data
    }

    getCopyrightData() {
        if (this.mapParameters.copyright.text === '') {
            return null
        }

        let resizeFactor = 1

        if (this.mapParameters.dpi) {
            resizeFactor = this.mapParameters.dpi / 300
        }

        let data = {
            text: this.mapParameters.copyright.text,
            font: {
                size: this.mapParameters.copyright.size * resizeFactor,
                family: this.mapParameters.copyright.font,
                lineWidth: this.mapParameters.copyright.size * resizeFactor / 10,
                strokeStyle: 'rgba(255, 255, 255, 1)',
                fillStyle: 'rgba(0, 0, 0, 1)'
            },
            position: {
                x: 0,
                y: 0
            },
            textAlign: 'left',
            textBaseline: 'top'
        }

        switch (this.mapParameters.copyright.anchor) {
            case 0:
                data.position.x = this.mapParameters.borderLeft + this.mapParameters.copyright.x * resizeFactor
                data.position.y = this.mapParameters.borderTop + this.mapParameters.copyright.y * resizeFactor

                break

            case 1:
                data.position.x = this.mapParameters.borderLeft + this.mapParameters.copyright.x * resizeFactor
                data.position.y = this.mapParameters.height - this.mapParameters.borderBottom - this.mapParameters.copyright.y * resizeFactor

                data.textBaseline = 'bottom'

                break

            case 2:
                data.position.x = this.mapParameters.width - this.mapParameters.borderRight - this.mapParameters.copyright.x * resizeFactor
                data.position.y = this.mapParameters.borderTop + this.mapParameters.copyright.y * resizeFactor

                data.textAlign = 'right'

                break

            case 3:
                data.position.x = this.mapParameters.width - this.mapParameters.borderRight - this.mapParameters.copyright.x * resizeFactor
                data.position.y = this.mapParameters.height - this.mapParameters.borderBottom - this.mapParameters.copyright.y * resizeFactor

                data.textAlign = 'right'
                data.textBaseline = 'bottom'

                break
        }

        return data
    }

    getWatermarkData() {
        if (!this.mapParameters.watermark) {
            return null
        }

        let data = {
            text: this.mapParameters.watermark.text,
            textAlign: 'center',
            textBaseline: 'middle',
            lineWidth: 0,
            fillStyle: 'rgba(0, 0, 0, ' + this.mapParameters.watermark.opacity + ')',
            font: {
                size: this.mapParameters.height / 10,
                family: this.mapParameters.watermark.font
            },
            position: {
                x: this.mapParameters.borderLeft + this.mapParameters.width / 2,
                y: this.mapParameters.borderTop + this.mapParameters.height / 2
            }
        }

        return data
    }

    async draw(canvas) {
        let newCanvas = document.createElement('canvas')

        newCanvas.width = canvas.width
        newCanvas.height = canvas.height

        let newContext = newCanvas.getContext('2d')

        newContext.drawImage(canvas, 0, 0)

        await this.drawPrimitives(newContext)

        this.drawScaleBar(newContext)
        this.drawCopyright(newContext)
        this.drawWatermark(newContext)

        return newCanvas
    }

    async drawPrimitives(context) {
        let totalPixels = 360.0 * this.mapParameters.width / (this.mapParameters.longitudeMax - this.mapParameters.longitudeMin)
        let left = this.longitudeToNormalized(this.mapParameters.longitudeMin) * totalPixels
        let top = this.latitudeToNormalized(this.mapParameters.latitudeMax) * totalPixels

        // polylines

        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.setLineDash([])

        for (let polyline of this.mapParameters.primitives.polylines) {
            context.setLineDash(polyline.dashes)

            if (polyline.outline_width > 0) {
                this.drawPolyline(context, polyline.polyline, polyline.outline_width * 2 + polyline.width, polyline.outline_color, polyline.alpha, totalPixels, left, top)
            }

            this.drawPolyline(context, polyline.polyline, polyline.width, polyline.color, polyline.alpha, totalPixels, left, top)
        }

        context.globalAlpha = 1

        // lines

        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.setLineDash([])

        for (let line of this.mapParameters.primitives.lines) {

        }

        // icons

        function drawRoundedRect(context, x, y, w, h, r) {
            if (w < 2 * r) {
                r = w / 2
            }

            if (h < 2 * r) {
                r = h / 2
            }

            context.beginPath()

            context.moveTo(x + r, y)

            context.arcTo(x + w, y, x + w, y + h, r)
            context.arcTo(x + w, y + h, x, y + h, r)
            context.arcTo(x, y + h, x, y, r)
            context.arcTo(x, y, x + w, y, r)

            context.closePath()
        }

        for (let icon of this.mapParameters.primitives.icons) {
            let iconUrl = icon.URL
            if (!iconUrl.match(/^https?:\/\//)) {
                iconUrl = location.origin + iconUrl
            }
            let imageResponse = await fetch(iconUrl)
            let imageBlob = await imageResponse.blob()

            icon.image = new Image()
            icon.image.src = URL.createObjectURL(imageBlob)

            await icon.image.decode()

            if (icon.LT != 0 && icon.LN != 0) {
                icon.X = this.longitudeToNormalized(parseFloat(icon.LN)) * totalPixels - left
                icon.Y = this.latitudeToNormalized(parseFloat(icon.LT)) * totalPixels - top
            }

            if (icon.X2 == 0) {
                icon.X2 = icon.X
            }

            if (icon.Y2 == 0) {
                icon.Y2 = icon.Y
            }

            // Draw arrow

            let arrowPoints = []

            let alpha
            let beta
            let x2
            let y2

            let l = Math.sqrt(
                (icon.X - icon.X2) *
                (icon.X - icon.X2) +
                (icon.Y - icon.Y2) *
                (icon.Y - icon.Y2))

            if (l != 0) {
                alpha = Math.asin((icon.X - icon.X2) / l)

                if (icon.Y2 > icon.Y) {
                    l = -l
                    alpha = -alpha
                }

                beta = Math.asin(icon.AT / l)

                arrowPoints[3 * 2 + 0] = arrowPoints[0 * 2 + 0] = icon.X
                arrowPoints[3 * 2 + 1] = arrowPoints[0 * 2 + 1] = icon.Y

                x2 = Math.cos(Math.PI / 2 - alpha - beta) * l
                y2 = Math.sin(Math.PI / 2 - alpha - beta) * l

                arrowPoints[1 * 2 + 0] = arrowPoints[0 * 2 + 0] - x2
                arrowPoints[1 * 2 + 1] = arrowPoints[0 * 2 + 1] - y2

                x2 = Math.cos(Math.PI / 2 - alpha + beta) * l
                y2 = Math.sin(Math.PI / 2 - alpha + beta) * l

                arrowPoints[2 * 2 + 0] = arrowPoints[0 * 2 + 0] - x2
                arrowPoints[2 * 2 + 1] = arrowPoints[0 * 2 + 1] - y2
            }

            context.strokeStyle = icon.IBC
            context.fillStyle = icon.IFC

            drawRoundedRect(
                context,
                icon.X2 + icon.L - icon.W / 2 - icon.IBP,
                icon.Y2 + icon.T - icon.H / 2 - icon.IBP,
                icon.W + icon.IBP * 2,
                icon.H + icon.IBP * 2,
                icon.IBR,
                icon.IBR)

            context.fill()
            context.stroke()

            if (icon.image && icon.image.complete) {
                context.drawImage(icon.image, icon.X2 + icon.L - icon.W / 2, icon.Y2 + icon.T - icon.H / 2, icon.W, icon.H)
            }
        }
    }

    drawPolyline(context, polyline, width, color, alpha, totalPixels, left, top) {
        context.beginPath()

        context.lineWidth = width
        context.strokeStyle = '#' + color
        context.globalAlpha = alpha

        let x = this.longitudeToNormalized(polyline[0][1]) * totalPixels - left
        let y = this.latitudeToNormalized(polyline[0][0]) * totalPixels - top

        context.moveTo(x, y)

        for (let i = 1; i < polyline.length; i++) {
            x = this.longitudeToNormalized(polyline[i][1]) * totalPixels - left
            y = this.latitudeToNormalized(polyline[i][0]) * totalPixels - top

            context.lineTo(x, y)
        }

        context.stroke()
    }

    drawScaleBar(context) {
        let scalebarData = this.getScaleBarData()

        if (scalebarData === null) {
            return
        }

        context.lineCap = scalebarData.lineCap

        context.beginPath()

        context.lineWidth = scalebarData.outerSize
        context.strokeStyle = "rgba(255, 255, 255, 1)"

        if (scalebarData.type === 1) {
            context.moveTo(scalebarData.km.x, scalebarData.km.y - scalebarData.tailSize * 4)
            context.lineTo(scalebarData.km.x, scalebarData.km.y + scalebarData.tailSize * 4)

            context.moveTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y - scalebarData.tailSize * 4)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y)

            context.moveTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y + scalebarData.tailSize * 4)

            context.moveTo(scalebarData.km.x, scalebarData.km.y)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y)

            context.moveTo(scalebarData.mi.x, scalebarData.km.y)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y)

            context.moveTo(scalebarData.km.x, scalebarData.km.y - scalebarData.tailSize * 2)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y - scalebarData.tailSize * 2)

            context.moveTo(scalebarData.km.x, scalebarData.km.y + scalebarData.tailSize * 2)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y + scalebarData.tailSize * 2)

            context.stroke()
            context.beginPath()

            context.fillStyle = "rgba(0, 0, 0, 1)"
            context.rect(scalebarData.km.width >= 0 ? scalebarData.km.x : (scalebarData.km.x + scalebarData.km.width), scalebarData.km.y - scalebarData.tailSize * 2, scalebarData.km.width >= 0 ? scalebarData.km.width : -scalebarData.km.width, scalebarData.tailSize * 2)

            context.fill()
            context.beginPath()

            context.fillStyle = "rgba(255, 255, 255, 1)"
            context.rect(scalebarData.mi.width >= 0 ? scalebarData.mi.x : (scalebarData.mi.x + scalebarData.mi.width), scalebarData.km.y, scalebarData.mi.width >= 0 ? scalebarData.mi.width : -scalebarData.mi.width, scalebarData.tailSize * 2)

            context.fill()
            context.beginPath()

            context.lineWidth = scalebarData.innerSize
            context.strokeStyle = "rgba(0, 0, 0, 1)"

            context.moveTo(scalebarData.km.x, scalebarData.km.y - scalebarData.tailSize * 4)
            context.lineTo(scalebarData.km.x, scalebarData.km.y + scalebarData.tailSize * 4)

            context.moveTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y - scalebarData.tailSize * 4)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y)

            context.moveTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y + scalebarData.tailSize * 4)

            context.moveTo(scalebarData.km.x, scalebarData.km.y)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y)

            context.moveTo(scalebarData.mi.x, scalebarData.km.y)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y)

            context.moveTo(scalebarData.km.x, scalebarData.km.y - scalebarData.tailSize * 2)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y - scalebarData.tailSize * 2)

            context.moveTo(scalebarData.km.x, scalebarData.km.y + scalebarData.tailSize * 2)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.km.y + scalebarData.tailSize * 2)
        } else {
            context.moveTo(scalebarData.km.x, scalebarData.km.y - scalebarData.tailSize)
            context.lineTo(scalebarData.km.x, scalebarData.km.y + scalebarData.tailSize)

            context.moveTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y - scalebarData.tailSize)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y + scalebarData.tailSize)

            context.moveTo(scalebarData.km.x, scalebarData.km.y)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y)

            context.moveTo(scalebarData.km.x, scalebarData.km.y - scalebarData.tailSize)
            context.lineTo(scalebarData.km.x, scalebarData.km.y + scalebarData.tailSize)

            context.stroke()
            context.beginPath()

            context.lineWidth = scalebarData.innerSize
            context.strokeStyle = "rgba(0, 0, 0, 1)"

            context.moveTo(scalebarData.km.x, scalebarData.km.y - scalebarData.tailSize)
            context.lineTo(scalebarData.km.x, scalebarData.km.y + scalebarData.tailSize)

            context.moveTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y - scalebarData.tailSize)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y + scalebarData.tailSize)

            context.moveTo(scalebarData.km.x, scalebarData.km.y)
            context.lineTo(scalebarData.km.x + scalebarData.km.width, scalebarData.km.y)

            context.stroke()
            context.beginPath()

            context.lineWidth = scalebarData.outerSize
            context.strokeStyle = "rgba(255, 255, 255, 1)"

            context.moveTo(scalebarData.mi.x, scalebarData.mi.y - scalebarData.tailSize)
            context.lineTo(scalebarData.mi.x, scalebarData.mi.y + scalebarData.tailSize)

            context.moveTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.mi.y - scalebarData.tailSize)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.mi.y + scalebarData.tailSize)

            context.moveTo(scalebarData.mi.x, scalebarData.mi.y)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.mi.y)

            context.stroke()
            context.beginPath()

            context.lineWidth = scalebarData.innerSize
            context.strokeStyle = "rgba(0, 0, 0, 1)"

            context.moveTo(scalebarData.mi.x, scalebarData.mi.y - scalebarData.tailSize)
            context.lineTo(scalebarData.mi.x, scalebarData.mi.y + scalebarData.tailSize)

            context.moveTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.mi.y - scalebarData.tailSize)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.mi.y + scalebarData.tailSize)

            context.moveTo(scalebarData.mi.x, scalebarData.mi.y)
            context.lineTo(scalebarData.mi.x + scalebarData.mi.width, scalebarData.mi.y)
        }

        context.stroke()

        context.font = (scalebarData.outerSize * 2) + "px '" + scalebarData.font.family + "'"
        context.lineWidth = scalebarData.strokeWidth
        context.strokeStyle = "rgba(255, 255, 255, 1)"
        context.fillStyle = "rgba(0, 0, 0, 1)"
        context.textAlign = scalebarData.textAlign
        context.textBaseline = scalebarData.textBaseline

        context.strokeText(scalebarData.km.text, scalebarData.km.textPosition.x, scalebarData.km.textPosition.y)
        context.fillText(scalebarData.km.text, scalebarData.km.textPosition.x, scalebarData.km.textPosition.y)

        context.strokeText(scalebarData.mi.text, scalebarData.mi.textPosition.x, scalebarData.mi.textPosition.y)
        context.fillText(scalebarData.mi.text, scalebarData.mi.textPosition.x, scalebarData.mi.textPosition.y)
    }

    drawCopyright(context) {
        let copyrightData = this.getCopyrightData()

        if (copyrightData === null) {
            return
        }

        context.font = copyrightData.font.size + "px '" + copyrightData.font.family + "'"
        context.lineWidth = copyrightData.font.size / 10
        context.strokeStyle = copyrightData.font.strokeStyle
        context.fillStyle = copyrightData.font.fillStyle

        context.textAlign = copyrightData.textAlign
        context.textBaseline = copyrightData.textBaseline

        context.strokeText(copyrightData.text, copyrightData.position.x, copyrightData.position.y)
        context.fillText(copyrightData.text, copyrightData.position.x, copyrightData.position.y)
    }

    drawWatermark(context) {
        let watermarkData = this.getWatermarkData()

        if (watermarkData === null) {
            return
        }

        context.textAlign = watermarkData.textAlign
        context.textBaseline = watermarkData.textBaseline

        context.font = watermarkData.font.size + "px '" + watermarkData.font.family + "'"
        context.lineWidth = watermarkData.lineWidth
        context.fillStyle = watermarkData.fillStyle

        context.fillText(watermarkData.text, watermarkData.position.x, watermarkData.position.y)
    }
}

import * as L from 'leaflet';

declare module 'leaflet' {
    namespace GridLayer {
        class VMS2 extends L.GridLayer {
            constructor(options?: VMS2Options);

            getMapCanvas(options: MapCanvasOptions): Promise<void>;
        }

        interface MapCanvasOptions {
            /**
             * @default 72
             * @description Map image resolution. Typically 300 for print quality maps.
             */
            dpi?: number;
            /**
             * @description Minimum Latitude of the map bounding box.
             */
            latitudeMin: number;
            /**
             * @description Minimum Longitude of the map bounding box.
             */
            longitudeMin: number;
            /**
             * @description Maximum Latitude of the map bounding box.
             */
            latitudeMax: number;
            /**
             * @description Maximum Longitude of the map bounding box.
             */
            longitudeMax: number;
            /**
             * @description Image width in pixels.
             */
            width: number;
            /**
             * @description Image height in pixels.
             */
            height: number;
        }

        interface VMS2Options extends L.GridLayerOptions {
            /**
             * @example '12345678-abcd-efgh-ijkl-1234567890ab'
             * @default ''
             * @description The locr VMS2 access key.
             */
            accessKey?: string;
            /**
             * @default false
             * @description Defines if a map will be created without having text and icons cropped by the border. Use true for creating printable maps.
             */
            allowedMapArea?: boolean;
            /**
             * @default 'https://vms2.locr.com/api/styles/assets'
             */
            assetsUrl?: string;
            /**
             * @default 0
             * @description Dynamic style modifier. Offset to be added to each layer style detail setting.
             */
            detailOffset?: number;
            /**
             * @default 1
             * @description Scaling factor for map display to simulate a bigger or smaller screen to retain the map area and visual style to fit in the Leaflet container.
             */
            mapScale?: number;
            /**
             * @default 1
             * @description Dynamic style modifier. Scaling factor to scale the width of lines and the sizes of text and icon elements.
             */
            objectScale?: number;
            /**
             * @default '4201'
             * @description A predefined locr map style ID or a custom style definition in the JSON format.
             */
            style?: string;
            /**
             * @default {}
             */
            styleOverride?: object;
            /**
             * @default 'https://vms2.locr.com/api/style/{style_id}'
             */
            styleUrl?: string;
            /**
             * @default 'https://vms2.locr.com/api/tile/{z}/{y}/{x}?k={key}&v={value}&t={type}'
             */
            tileUrl?: string;
            /**
             * @default 2
             * @description Base value for zoom level calculation. Changing this requires to define a different CRS as well.
             */
            zoomPowerBase?: number
            /**
             * @default 0
             * @description Dynamic style modifier. Negative values will lower the zoom_range parameter values for each layer style.
             */
            zoomRangeOffset?: number;
        }
    }

    namespace gridLayer {
        function vms2(options?: GridLayer.VMS2Options): GridLayer.VMS2;
    }
}

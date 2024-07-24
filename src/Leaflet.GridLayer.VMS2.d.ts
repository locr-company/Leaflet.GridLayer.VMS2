import * as L from 'leaflet';

declare module 'leaflet' {
    namespace GridLayer {
        class VMS2 extends L.GridLayer {
            constructor(options?: VMS2Options);
        }

        interface VMS2Options extends L.GridLayerOptions {
            /**
             * @example '12345678-abcd-efgh-ijkl-1234567890ab'
             */
            accessKey?: string;
            /**
             * @default 'https://vms2.locr.com/api/styles/assets'
             */
            assetsUrl?: string;
            /**
             * @default 0
             */
            detailOffset?: number;
            /**
             * @default 1
             */
            mapScale?: number;
            /**
             * @default 1
             */
            objectScale?: number;
            /**
             * @default '4201'
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
             */
            zoomPowerBase?: number
            /**
             * @default 0
             */
            zoomRangeOffset?: number;
        }
    }

    namespace gridLayer {
        function vms2(options?: GridLayer.VMS2Options): GridLayer.VMS2;
    }
}

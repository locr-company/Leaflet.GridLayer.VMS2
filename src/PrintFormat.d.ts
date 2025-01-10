export default class PrintFormat {
    static get DEFAULT_PRINT_DPI(): number;
    static get DEFAULT_UNIT_TYPE(): string;

    static get CM_PER_INCH(): number;
    static get MM_PER_INCH(): number;

    static get DEFAULT_PRINT_SCALE(): number;

    constructor(printSizeInfo: {width: number, height: number, dpi?: number, printScale?: number, unitType?: 'px'|'cm'|'mm'|'in'|'pt'|'pc'});
    buildMaskForClipPath(mapContainerWidth: number, mapContainerHeight: number): string;
    calculateMapScale(mapContainerWidth: number, mapContainerHeight: number): number;
    calculateVirtualMapContainerSize(mapContainerWidth: number, mapContainerHeight: number): {width: number, height: number};
    getSize(): {width: number, height: number, dpi: number, printScale: number};
}

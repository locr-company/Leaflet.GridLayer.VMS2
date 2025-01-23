export default class MapOverlay {
    constructor(mapData: {width: number, height: number});
    get width(): number;
    get height(): number;
    add(layer: SvgLayer): void;
    addFontFace(fontFace: CustomFontFace): void;
    addOrReplace(layer: SvgLayer): void;
    getSvgOverlay(size: {width?: number, height?: number}|undefined): string;
    replaceTextContent(id: string, textContent: string): void;
}

export class SvgLayer {
    constructor(svgString: string);
    getSvgSource(): string;
}

export class ImageSvgLayer extends SvgLayer {
    constructor(imageInfo: {href: string, x: string|number, y: string|number, [key: string]: any});
}

export class TextSvgLayer extends SvgLayer {
    constructor(textInfo: {text: string, x: string|number, y: string|number, [key: string]: any});
}

export class CustomFontFace {
    constructor(family: string, source: string, descriptors: FontFaceDescriptors?);
    buildCssFontFace(): string;
}
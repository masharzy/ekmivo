// Types for the vendored MIT-licensed Kazuhiko Arase QR generator.
type QRCodeInstance={
 addData(data:string):void;
 make():void;
 createSvgTag(options?:{cellSize?:number;margin?:number;scalable?:boolean}):string;
};
declare const qrcode:(typeNumber:0,errorCorrectionLevel:"L"|"M"|"Q"|"H")=>QRCodeInstance;
export default qrcode;

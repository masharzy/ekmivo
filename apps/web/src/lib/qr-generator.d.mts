declare module "*.mjs" {
 const qrcode: (typeNumber: 0, errorCorrectionLevel: "L"|"M"|"Q"|"H") => {
  addData(data:string):void;
  make():void;
  createSvgTag(options?:{cellSize?:number;margin?:number,scalable?:boolean}):string;
 };
 export default qrcode;
}

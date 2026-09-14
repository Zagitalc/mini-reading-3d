import {fallbackColour} from './static-routes';
export const busBrands:Record<string,[string,string]>={'5':['#00876d','emerald'],'6':['#00876d','emerald'],'6a':['#00876d','emerald'],'13':['#db761c','orange'],'14':['#db761c','orange'],'15':['#4098c5','sky blue'],'15a':['#4098c5','sky blue'],'17':['#784699','purple']};
export const busColour=(id:string,line:string)=>busBrands[line.toLowerCase()]?.[0]??fallbackColour(id);

import {z} from 'zod';
import type {Weather} from '../../shared/types';
const current=z.object({time:z.number(),interval:z.number().positive(),temperature_2m:z.number(),cloud_cover:z.number().min(0).max(100),rain:z.number().nonnegative(),showers:z.number().nonnegative(),snowfall:z.number().nonnegative(),weather_code:z.number(),wind_speed_10m:z.number().nonnegative(),wind_direction_10m:z.number(),is_day:z.number()});
export function parseWeather(input:unknown,now=Date.now()):Weather {
 const c=current.parse(z.object({current}).parse(input).current);
 if(now-c.time*1000>3_600_000||c.time*1000>now+60_000)throw Error('Weather model timestamp is stale');
 return {id:'reading',temperature:c.temperature_2m,cloudCover:c.cloud_cover,rainMm:c.rain+c.showers,snowCm:c.snowfall,intervalSeconds:c.interval,code:c.weather_code,windKph:c.wind_speed_10m,windDirection:c.wind_direction_10m,isDay:c.is_day===1,observedAt:new Date(c.time*1000).toISOString(),source:'Open-Meteo model estimate',sourceUrl:'https://open-meteo.com/'};
}
export async function fetchWeather() {
 const url='https://api.open-meteo.com/v1/forecast?latitude=51.455&longitude=-0.972&current=temperature_2m,cloud_cover,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,is_day&timeformat=unixtime&timezone=Europe%2FLondon';
 const r=await fetch(url,{signal:AbortSignal.timeout(12_000)});if(!r.ok)throw Error(`Weather HTTP ${r.status}`);return [parseWeather(await r.json())];
}

// Optional repeatable Chromium smoke check. CUA was used for delivery-time browser QA.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL??'http://127.0.0.1:5174/');
 await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
 await page.getByRole('searchbox').fill('Caversham');
 await page.locator('#search-results').getByRole('button',{name:'Caversham suburb',exact:true}).click();
 await page.locator('[data-layer="buildings"]').uncheck();
 await page.locator('[data-layer="buildings"]').check();
 await page.locator('#data-button').click();
 await page.getByRole('heading',{name:'Reading, with context'}).waitFor();
 await page.locator('#close-details').click();
 await mkdir('test-results',{recursive:true});
 await page.screenshot({path:'test-results/desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.reload();
 await page.locator('#loading').waitFor({state:'hidden'});
 await page.screenshot({path:'test-results/mobile.png'});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Browser smoke checks passed');
} finally { await browser.close(); }

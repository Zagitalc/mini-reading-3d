import {chromium,expect} from '@playwright/test';
// The phone details sheet: its bar expands and shrinks the sheet by tap or by dragging, and a long drag down from the short sheet closes it.
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.APP_URL??'http://127.0.0.1:8790';
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/v1/**',route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/config')?{tomtom:false,weather:false,fuel:false,rivers:false}:{version:1,data:[],routes:{}}}));
 await page.goto(base);await page.locator('#loading').waitFor({state:'hidden'});
 const panel=page.locator('#details'),handle=page.locator('#sheet-handle'),height=async()=>(await panel.boundingBox()).height;
 const drag=async dy=>{const b=await handle.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=8;i++)await page.mouse.move(x,y+dy*i/8);await page.mouse.up();await page.waitForTimeout(300);};
 await page.locator('#data-button').click();await expect(panel).toBeVisible();const short=await height();
 await handle.click();await expect(panel).toHaveClass(/expanded/);await expect(handle).toHaveAttribute('aria-expanded','true');
 await handle.click();await expect(panel).not.toHaveClass(/expanded/);
 await drag(-220);await expect(panel).toHaveClass(/expanded/);expect(await height()).toBeGreaterThan(short);
 await drag(220);await expect(panel).not.toHaveClass(/expanded/);await expect(panel).toBeVisible();
 // A short wobble is neither a tap nor a drag that changes anything.
 await drag(-20);await expect(panel).not.toHaveClass(/expanded/);
 await drag(400);await expect(panel).toBeHidden();
 expect(errors).toEqual([]);console.log('sheet handle ok');
}finally{await browser.close();}

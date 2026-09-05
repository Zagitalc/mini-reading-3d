import{createApp}from'./app';
const{app,close}=await createApp();const port=Number(process.env.PORT??8787);const server=app.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`Mini Reading API: http://127.0.0.1:${port}`));let shutting=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(shutting)return;shutting=true;server.close(()=>{close();process.exit(0);});});

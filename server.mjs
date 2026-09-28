import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const requested=decodeURIComponent(url.pathname);
  const file=path.resolve(root,'.'+(requested.endsWith('/')?requested+'index.html':requested));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT)||5198,'127.0.0.1',()=>console.log(`Carrot Revolt Labs: http://127.0.0.1:${Number(process.env.PORT)||5198}`));

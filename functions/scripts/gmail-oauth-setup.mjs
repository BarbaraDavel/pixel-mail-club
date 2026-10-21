import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {google} from 'googleapis';

const file=new URL('./gmail-oauth-client.json',import.meta.url);
const out=new URL('./.gmail-refresh-token',import.meta.url);
const raw=JSON.parse(await readFile(file,'utf8'));
const client=raw.installed||raw.web;
if(!client?.client_id||!client?.client_secret)throw new Error('El archivo debe ser el JSON OAuth descargado desde Google Cloud.');
const redirect='http://localhost:53682/oauth2callback';
const oauth=new google.auth.OAuth2(client.client_id,client.client_secret,redirect);
const url=oauth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/gmail.send']});
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,redirect);
  if(u.pathname!=='/oauth2callback'){res.writeHead(404).end('Not found');return;}
  const code=u.searchParams.get('code');
  if(!code){res.writeHead(400).end('No se recibió el código OAuth.');return;}
  const {tokens}=await oauth.getToken(code);
  if(!tokens.refresh_token)throw new Error('Google no devolvió refresh_token. Revocá el acceso de prueba y repetí el proceso con consentimiento.');
  await writeFile(out,tokens.refresh_token+'\n',{encoding:'utf8',mode:0o600});
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<h2>Pixel Mail Club autorizado</h2><p>El token quedó guardado localmente. Podés cerrar esta ventana.</p>');
  console.log('Autorización completada. Refresh token guardado en functions/.gmail-refresh-token; no lo compartas ni lo subas a Git.');
  server.close();
 }catch(e){res.writeHead(500,{'content-type':'text/plain; charset=utf-8'}).end('No se pudo completar OAuth. Revisá la terminal.');console.error(e.message);server.close();}
});
server.listen(53682,'127.0.0.1',()=>{console.log('Abrí esta URL para autorizar pixel.stickersss@gmail.com:\n'+url+'\nNo compartas el token ni capturas que lo contengan.');});

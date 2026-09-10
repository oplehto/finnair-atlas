import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
import {validateSchedule} from '../public/schedule.mjs';
// Exercise the request handler directly: no listening socket required in CI.
async function request(path){const server=createServer();return new Promise(resolve=>{const result={};const res={writeHead(status,headers){result.status=status;result.headers=headers;},end(body){result.body=String(body);resolve(result);}};server.emit('request',{url:path},res);});}
test('serves an explicitly illustrative validated schedule',async()=>{const r=await request('/api/schedule');assert.equal(r.status,200);const data=validateSchedule(JSON.parse(r.body));assert.equal(data.demo,true);assert.equal(data.flights.length,476);assert.equal(data.title,'Finnair, by air');});
test('serves browser entry point and rejects arbitrary paths',async()=>{assert.equal((await request('/')).status,200);assert.equal((await request('/../server.mjs')).status,404);assert.equal((await request('/demo.mjs')).status,404);});

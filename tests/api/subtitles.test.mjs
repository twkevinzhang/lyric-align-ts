import{test}from'node:test';import assert from'node:assert/strict';import{parseSrt}from'../../src/subtitles.ts';
test('parse source subtitles without passing reference times into inference',()=>{
 assert.deepEqual(parseSrt('\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\nhello\r\nworld\r\n'),[{id:1,start:1,end:2,text:'hello world'}]);assert.deepEqual(parseSrt(''),[]);
});
test('malformed timestamps and zero duration reject',()=>{
 for(const value of ['1\n00:99:00,000 --> 00:99:01,000\na','1\n00:00:01,000 --> 00:00:01,000\na','bad'])assert.throws(()=>parseSrt(value));
});

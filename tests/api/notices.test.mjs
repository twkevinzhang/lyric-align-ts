import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
test('bundled tokenizer implementation has a separate license notice from its vocabulary data',async()=>{
 const text=await readFile(new URL('../../THIRD_PARTY_NOTICES.md',import.meta.url),'utf8');
 assert.match(text,/## tiktoken 1\.0\.22/);assert.match(text,/Copyright \(c\) 2022 OpenAI, Shantanu Jain/);assert.match(text,/https:\/\/github\.com\/dqbd\/tiktoken/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spokenLyrics,naturalJapaneseSpacing} from '../../src/core/lyrics.mjs';
test('strip Japanese parenthetical translations after Latin lyrics in txt and flattened SRT',()=>{
  assert.equal(spokenLyrics('You still sing.\n(お前はまだ)\n次の歌詞'),'You still sing.\n次の歌詞');
  assert.equal(spokenLyrics('You still sing. (お前はまだ)'),'You still sing.');
});
test('remove artificial Japanese word spacing while preserving Latin separation and line breaks',()=>{
  assert.equal(naturalJapaneseSpacing('高架橋 を 抜け たら'),'高架橋を抜けたら');
  assert.equal(naturalJapaneseSpacing('Money 目当て に 群がる ヘッズ\nYou still sing'),'Money 目当てに群がるヘッズ\nYou still sing');
});
test('preserve sung parentheses, Japanese lyrics and non-translation cues',()=>{
  for(const text of ['歌う（もう一度）','Hello (again)','（ああ）','Money 目当てに群がるヘッズ','sing\n\n次の歌詞'])assert.equal(spokenLyrics(text),text);
});

#!/usr/bin/env node
// Extract product metadata only. Never import or execute database seed entrypoints.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {listBrowserPoseGameDefinitions,buildBrowserPoseGameContentSeed} from '../apps/web/src/lib/browser-pose-game-library.ts';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const sourcePath='packages/db/prisma/seed.ts';const source=readFileSync(sourcePath,'utf8');const ast=ts.createSourceFile(sourcePath,source,ts.ScriptTarget.Latest,true);
const allowed=new Set(['browserPoseRequiredMetrics','dynamicDifficultyTriggers','formalDynamicDifficultyPolicy','browserPoseResultSchema','unityResultSchema','cognitiveRequiredMetrics','cognitiveResultSchema','formalPublishedGameMetadata','formalBrowserPoseGameMetadata','formalCognitiveGameMetadata']);
let declarations=[];for(const statement of ast.statements){if(ts.isVariableStatement(statement)&&statement.declarationList.declarations.every(d=>allowed.has(d.name.getText(ast))))declarations.push(statement.getText(ast));}
const extracted={};function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='database.gameContent.upsert'){const o=n.arguments[0];if(ts.isObjectLiteralExpression(o)){const c=o.properties.find(p=>p.name?.getText(ast)==='create');if(c&&ts.isPropertyAssignment(c)&&ts.isObjectLiteralExpression(c.initializer)){const code=c.initializer.properties.find(p=>p.name?.getText(ast)==='code');if(code&&ts.isPropertyAssignment(code)&&ts.isStringLiteral(code.initializer)&&['memory_path','rhythm_reach_3d'].includes(code.initializer.text))extracted[code.initializer.text]=c.initializer.getText(ast);}}}ts.forEachChild(n,walk);}walk(ast);
if(Object.keys(extracted).length!==2||declarations.length!==allowed.size)throw Error('Source metadata shape changed; review required');
const ctx=vm.createContext({result:null});vm.runInContext(ts.transpileModule(declarations.join('\n')+'\nresult=['+Object.values(extracted).join(',')+'];',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx,{timeout:1000});
const fields=['code','name','runtimeType','gameVersion','trainingTargets','tags','defaultDuration','defaultDifficulty','supportsCamera','supportsMicrophone','supportedInputModes','requiredMetrics','difficultyPolicy','dynamicDifficultyTriggers','requiredPermissions','resultSchema','publishedStatus'];
const games=[...listBrowserPoseGameDefinitions().map(x=>buildBrowserPoseGameContentSeed(x.code)),...ctx.result].map(x=>({create:Object.fromEntries(fields.filter(k=>x[k]!==undefined).map(k=>[k,x[k]])),...(x.runtimeType==='unity_webgl'?{publish:Object.fromEntries(['manifestUrl','buildBaseUrl','gameVersion','bridgeProtocolVersion','buildStatus','releaseChannel','supportsCamera','supportsMicrophone','supportedInputModes','requiredMetrics','difficultyPolicy','dynamicDifficultyTriggers','requiredPermissions','resultSchema','publishedStatus'].map(k=>[k,x[k]]))}:{})}));
if(games.length!==9||new Set(games.map(x=>x.create.code)).size!==9)throw Error('Expected exactly nine real games');
for(const {create:g} of games){if(!g.gameVersion||!g.requiredMetrics.length||g.publishedStatus!=='published')throw Error('Incomplete '+g.code);}
const provenance=['apps/web/src/lib/browser-pose-game-library.ts',sourcePath,'apps/web/public/unity/rhythm_reach_3d/0.1.2/manifest.json'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const result={schema:'rehab-existing-production-games/v1',sourcePolicy:'7 games from actual runtime library; Unity/cognitive metadata statically extracted from seed source without execution; no users, clinical conditions, scores, or training results imported',games,provenance};
const out=process.argv[2]??'/tmp/rehab-production-game-catalog.json';writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({catalog:out,count:games.length,codes:games.map(x=>x.create.code)}));

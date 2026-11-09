import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {closeSync,existsSync,lstatSync,openSync,readSync,readdirSync,readFileSync,
  writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const reject=code=>{throw new Error('DEMO_RELEASE_'+code);};
export const BUILDER_PIN='26.18.1';
export const ELECTRON_PIN='44.9.3';
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA=/^[0-9a-f]{40}$/;

function expectedNames(platform,arch,version){
  if(!SEMVER.test(version))reject('INVALID_VERSION');
  if(platform==='win'&&arch==='x64')
    return ['SmartPOS-DEMO-'+version+'-win-x64-setup.exe'];
  if(platform==='mac'&&['x64','arm64'].includes(arch))
    return ['SmartPOS-DEMO-'+version+'-mac-'+arch+'.dmg',
      'SmartPOS-DEMO-'+version+'-mac-'+arch+'.zip'];
  return reject('UNSUPPORTED_TARGET');
}
function assertInstallerMagic(path,name,size){
  const fd=openSync(path,'r');
  try{
    const header=Buffer.alloc(4);
    readSync(fd,header,0,4,0);
    if(name.endsWith('.exe')&&header.toString('ascii',0,2)!=='MZ')reject('INVALID_EXE');
    if(name.endsWith('.zip')&&header.toString('ascii',0,2)!=='PK')reject('INVALID_ZIP');
    if(name.endsWith('.dmg')){
      const end=Buffer.alloc(4);
      readSync(fd,end,0,4,size-512);
      if(end.toString('ascii')!=='koly')reject('INVALID_DMG');
    }
  }finally{closeSync(fd);}
}
function statAndDigest(path,name){
  if(!existsSync(path))reject('MISSING_INSTALLER');
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<1024*1024)
    reject('INVALID_INSTALLER');
  assertInstallerMagic(path,name,stat.size);
  const bytes=readFileSync(path);
  return {file:name,bytes:stat.size,sha256:createHash('sha256')
    .update(bytes).digest('hex')};
}
export function verifyDemoArtifacts(output,{platform,arch,version,commit='0'.repeat(40)}){
  if(!SHA.test(commit))reject('INVALID_COMMIT');
  const names=expectedNames(platform,arch,version);
  const realDir=resolve(output);
  const st=lstatSync(realDir);
  if(!st.isDirectory()||st.isSymbolicLink())reject('INVALID_OUTPUT_DIRECTORY');
  // Fail closed on unrecognized installer extension in same output folder.
  const present=readdirSync(realDir);
  for(const item of present){
    if(/\.(?:exe|dmg|zip)$/i.test(item)&&!names.includes(item))
      reject('UNEXPECTED_INSTALLER');
  }
  const artifacts=names.map(name=>statAndDigest(join(realDir,name),name));
  const sums=artifacts.map(a=>a.sha256+'  '+a.file).join('\n')+'\n';
  const provenance={
    schema:1,kind:'UNSIGNED_DEMO_ONLY',publish:false,
    installerTargets:[platform+'-'+arch],version,
    electron:ELECTRON_PIN,electronBuilder:BUILDER_PIN,
    nodeRequirement:'24.x',pnpmRequirement:'10.20.0',sourceCommit:commit,
    codeSigning:'NONE',notarization:'NONE',
    artifactChecksums:artifacts,
    caveat:'Untrusted CI artifacts only; no production release or byte-for-byte reproducibility guarantee.',
  };
  writeFileSync(join(realDir,'SHA256SUMS.txt'),sums);
  writeFileSync(join(realDir,'BUILD_PROVENANCE.json'),
    JSON.stringify(provenance,null,2)+'\n');
  return provenance;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [platform,arch]=process.argv.slice(2);
  try{
    const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
    const project=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
    const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'})
      .trim();
    const result=verifyDemoArtifacts(join(root,'demo-artifacts'),{
      platform,arch,version:project.version,commit,
    });
    console.log(JSON.stringify(result));
  }catch(error){console.error(error instanceof Error?error.message:'RELEASE_FAILED');
    process.exitCode=1;}
}

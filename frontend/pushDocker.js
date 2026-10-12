import { execFileSync } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (fs.existsSync(envFile)) loadEnvFile(envFile);
let packageFile = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

/* --- */

const repository = process.env.DOCKER_REPOSITORY;

try {
    if (!repository || !repository.trim()) {
        throw new Error('Defina DOCKER_REPOSITORY no .env da raiz antes de publicar.');
    }
    const dockerImage = `${repository}:voice-capture-client-${packageFile.version}`;
    console.log(`---- Criando Versão ${packageFile.version} ----`);

    execFileSync('sudo', ['docker', 'build', '-f', 'Dockerfile', '-t', dockerImage, '.'], { stdio: 'inherit' });
    console.log(`---- docker build created ----`);

    execFileSync('sudo', ['docker', 'push', dockerImage], { stdio: 'inherit' });
    console.log('---- docker push sended---- ');

    console.log('---- Versão Gerada ----');
} catch (e) {
    console.log(`Erro: ${e.message}`);
    process.exitCode = 1;
}

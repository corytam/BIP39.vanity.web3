// master.ts
//To run
// npx tsx src/multithread/master.ts
import { Worker } from 'worker_threads';

const CONCURRENCY = 6;  // Adjust number of workers to your CPU cores
const STOP_ALL_WORKERS = true;// Set to true to stop all workers once a match is found
const result_to_find = 1;//Adjust to find more or less
let resultCount=0;
const resultArray : any[] = [];
let found = false;
const workers: Worker[] = [];

function stopWorkers() {
  for (const w of workers) w.terminate();
  process.exit(0);
}

for (let i = 0; i < CONCURRENCY; i++) {
const worker = new Worker('./dist/multithread/tron-vanity-worker.js', {
    workerData: { workerId: i },
    });
  workers.push(worker);

  worker.on('message', (msg) => {
    if (msg.type === 'found') {
      console.log(`🎉 Match found by worker ${msg.workerId}!`);
      
      if (STOP_ALL_WORKERS){
        console.log(msg.details);
        stopWorkers();
      }else{
        resultArray.push(msg.details);
        resultCount++;
        if(resultCount===result_to_find){
          console.log("### All results found ###");
          for(var i=0;i<resultArray.length;i++){
            console.log("[Result #"+(i+1)+"]");
            console.log(resultArray[i]);
          }
          stopWorkers();
        }
      }
    } else if (msg.type === 'account') {
        console.log(`[Worker ${msg.workerId}] Checking account ${msg.account}`);
    } else if (msg.type === 'index') {
    console.log(`[Worker ${msg.workerId}]   → Index ${msg.index}`);
    } else if (msg.type === 'seeds') {
      console.log(`[Worker ${msg.workerId}]   → Seed count ${msg.count}`);
    }
  });

  worker.on('error', (err) => {
    console.error(`Worker ${i} error:`, err);
  });

  worker.on('exit', (code) => {
    if (!found && code !== 0) {
      console.log(`Worker ${i} stopped unexpectedly with exit code ${code}`);
    }
  });
}

console.log(`Started ${CONCURRENCY} workers...`);

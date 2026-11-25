import { dispatchPendingEvents } from "./core/events/dispatcher";

interface JobOptions {
  intervalMs?: number;
  dispatch?: () => Promise<unknown>;
}

//de tempo em tempo, entrega os eventos pendentes aos handlers
//devolve a função que para os jobs, usada quando o servidor desliga
export function startJobs({ intervalMs = 5_000, dispatch = dispatchPendingEvents }: JobOptions = {}): () => void {
  let running = false;

  const timer = setInterval(async () => {
    //se a anterior não terminou, pula esta ao invés de empilhar
    if (running) return;

    running = true;
    try {
      await dispatch();
    } catch (error) {
      // um erro não para o servidor nem os próximos ciclos
      console.error("Falha ao entregar eventos:", error);
    } finally {
      running = false;
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

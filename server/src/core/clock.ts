// parte do sistema que pega a hora atual.

export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

let current: Clock = systemClock;

// clock é um intermediário
export const clock: Clock = {
  now: () => current.now(),
};

// fixar o relogio
export function setClock(next: Clock): void {
  current = next;
}

export function resetClock(): void {
  current = systemClock;
}

// relogio parado num momento
export function fixedClock(start: Date | string) {
  let time = new Date(start).getTime();
  return {
    now: () => new Date(time),
    advance(ms: number) {
      time += ms;
    },
  };
}

// state.js
const EventEmitter = require("events");
const emitter = new EventEmitter();

let isStopped = false;

module.exports = {
  emitter,
  getIsStopped: () => isStopped,
  setStopped: (val) => {
    isStopped = val;
    if (val) {
      emitter.emit("stop"); // Kirim sinyal stop
    }
  },
};

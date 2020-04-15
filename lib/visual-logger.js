"use strict";

/* eslint-disable prefer-spread, one-var, max-statements, no-magic-numbers */

const assert = require("assert");
const util = require("util");
const chalk = require("chalk");
const defaultOutput = require("./default-output");

const Levels = {
  debug: 10,
  verbose: 20,
  info: 30,
  warn: 40,
  error: 50,
  fyi: 60,
  none: 100
};

const LevelColors = {
  debug: "blue",
  verbose: "cyan",
  info: "",
  warn: "yellow",
  error: "red",
  fyi: "magenta",
  none: ""
};

const LogItemTypes = {
  normal: 9,
  simple: 1,
  none: 0
};

const DEFAULT_SPINNER_INTERVAL = 100;

const SPIN_OFF = 0;
const SPIN_STARTED = 1;
const SPIN_RUNNING = 2;

class VisualLogger {
  constructor(options) {
    options = { renderFps: 30, ...options };
    this._options = options;
    this._items = [];
    this._itemOptions = {};
    this._lines = [];
    this._logLevel = Levels.info;
    this._itemType = LogItemTypes.normal;
    this._logData = [];
    this._output = options.output || defaultOutput;
    this._maxDots = options.maxDots !== undefined ? options.maxDots : 80;
    this._updatesPerDot = Number.isFinite(options.updatesPerDot) ? options.updatesPerDot : 5;
    this._dotUpdates = 0;
    this.color = options.color === undefined ? true : Boolean(options.color);
    this._spinTimer = null;
    assert(
      options.renderFps >= 1 && options.renderFps < 1000,
      `VisualLogger renderFps must be >= 1 and < 1000 `
    );
    this._renderInterval = Math.floor(1000.0 / options.renderFps + 0.5);
  }

  get logData() {
    return this._logData;
  }

  get color() {
    return this._color;
  }

  set color(enable) {
    this._color = enable;
    this.setPrefix();
  }

  static get spinners() {
    return ["|/-\\", "⠁⠁⠉⠙⠚⠒⠂⠂⠒⠲⠴⠤⠄⠄⠤⠠⠠⠤⠦⠖⠒⠐⠐⠒⠓⠋⠉⠈⠈", "⢹⢺⢼⣸⣇⡧⡗⡏", "⣾⣽⣻⢿⡿⣟⣯⣷"];
  }

  static get Levels() {
    return Levels;
  }

  static get LogItemTypes() {
    return LogItemTypes;
  }

  addItem(options) {
    const name = options.name;

    if (this._items.indexOf(name) >= 0) return this;

    Object.entries(this._itemOptions).forEach(
      ([, itemOpt]) => itemOpt._spinning && (itemOpt._spinning = SPIN_STARTED)
    );

    options = Object.assign({ spinInterval: DEFAULT_SPINNER_INTERVAL }, options);
    if (!options.color) {
      options.color = "white";
    }
    options._display = this._colorize(options.color, options.display || name);
    options._msg = this._renderLineMsg(options, "");
    this._itemOptions[name] = options;
    this._startItemSpinner(options);
    this._items.push(name);
    this._lines.push(this._renderLine(options));

    return this;
  }

  setItemType(flag) {
    if (!flag) {
      this._itemType = LogItemTypes.none;
    } else {
      this._itemType = LogItemTypes[flag] || LogItemTypes.none;
    }

    if (this._itemType === LogItemTypes.normal && !this._output.isTTY()) {
      this._itemType = LogItemTypes.simple;
    }

    if (this._itemType === LogItemTypes.simple) {
      this._dots = 0;
    }
    return this;
  }

  hasItem(name) {
    return Boolean(this._itemOptions[name]);
  }

  removeItem(name) {
    const options = this._itemOptions[name];
    if (!options) return this;

    this.clearItems();

    const x = this._items.indexOf(name);
    this._items.splice(x, 1);
    this._lines.splice(x, 1);
    delete this._itemOptions[name];
    this._stopItemSpinner(options);

    this._renderOutput();

    return this;
  }

  _colorize(color, str) {
    if (this._color) {
      return chalk[color](str);
    }
    return str;
  }

  setPrefix(prefixStr) {
    this._colorPrefix = {};
    const prefix = (this._defaultPrefix = prefixStr === undefined ? "> " : prefixStr);
    this._chalkLevel = chalk.level;
    Object.keys(LevelColors).forEach(level => {
      const color = LevelColors[level];
      if (color && this._color && this._chalkLevel > 0) {
        this._colorPrefix[level] = this._colorize(color, prefix);
      } else {
        this._colorPrefix[level] = prefix;
      }
    });
    return this;
  }

  prefix(x) {
    this._prefix = x;
    return this;
  }

  debug() {
    return this._log("debug", arguments);
  }

  verbose() {
    return this._log("verbose", arguments);
  }

  info() {
    return this._log("info", arguments);
  }

  log() {
    return this._log("info", arguments);
  }

  warn() {
    return this._log("warn", arguments);
  }

  error() {
    return this._log("error", arguments);
  }

  fyi() {
    return this._log("fyi", arguments);
  }

  _nextSpin(options) {
    if (!options.spinner || !options._spinning) {
      return false;
    }
    if (options._spinning === SPIN_STARTED || !Number.isInteger(options.spinIx)) {
      options.spinIx = 0;
      options._spinning = SPIN_RUNNING;
    } else {
      options.spinIx++;
    }

    if (options.spinIx >= options.spinner.length) {
      options.spinIx = 0;
    }
    return true;
  }

  updateItem(name, data) {
    const options = this._itemOptions[name];
    if (!options) return this;

    const itemIdx = this._items.indexOf(name);

    if (data !== undefined) {
      this._renderLineMsg(options, data);
      if (options.save !== false && data._save !== false) {
        this._save(options._msg);
      }

      if (data._render === false) return this;
    }

    if (this._shouldLogItem()) {
      if (data === undefined && !this._nextSpin(options)) {
        // if item doesn't have spinner and there's no data, then there's nothing to show
        return this;
      }

      this._lines[itemIdx] = this._renderLine(options);
      this._renderOutput();
    } else {
      this._lines[itemIdx] = options._msg;

      this._writeSimpleDot();
    }

    return this;
  }

  clearItems() {
    if (this._shouldLogItem() && this._lines.length > 0) {
      this._output.visual.clear();
    } else {
      this._checkSimpleDots();
    }
    return this;
  }

  freezeItems(showItems) {
    this._stopSpinTimer(true);
    for (const name in this._itemOptions) {
      this._stopItemSpinner(this._itemOptions[name]);
    }
    this._output.visual.clear();
    this._resetSimpleDots();
    if (showItems) this._output.write(`${this._lines.join("\n")}\n`);
    this._backupItemType = this._itemType;
    this._itemType = 0;

    return this;
  }

  unfreezeItems() {
    if (this._backupItemType) {
      this._itemType = this._backupItemType;
      this._backupItemType = undefined;
      for (const name in this._itemOptions) {
        this._startItemSpinner(this._itemOptions[name]);
      }
    }

    return this;
  }

  shutdown(showItems) {
    this.freezeItems(showItems);
    clearTimeout(this._renderTimer);
  }

  _checkSimpleDots() {
    if (this._itemType === LogItemTypes.simple && this._dots >= this._maxDots) {
      this._dots = 0;
      this._output.write("\n");
    }
  }

  _resetSimpleDots() {
    if (this._dots > 0) {
      this._dots = 0;
      this._output.write("\n");
    }
  }

  _writeSimpleDot() {
    if (this._itemType === LogItemTypes.simple) {
      this._dotUpdates++;
      if (this._dotUpdates === this._updatesPerDot) {
        this._dotUpdates = 0;
        this._dots++;
        this._output.write(".");
        this._checkSimpleDots();
      }
    }
  }

  _startSpinTimer() {
    if (!this._spinTimer && this._shouldLogItem()) {
      this._spinTimer = setInterval(() => {
        Object.keys(this._itemOptions)
          .concat(Object.getOwnPropertySymbols(this._itemOptions))
          .forEach(name => {
            const options = this._itemOptions[name];
            if (options._spinning && options.spinInterval === DEFAULT_SPINNER_INTERVAL) {
              this._nextSpin(options);
              const itemIdx = this._items.indexOf(options.name);
              this._lines[itemIdx] = this._renderLine(options);
            }
          });
        this._renderOutput();
      }, DEFAULT_SPINNER_INTERVAL).unref();
    }
  }

  _stopSpinTimer(force = false) {
    if (force || Object.entries(this._itemOptions).every(([, itemOpt]) => !itemOpt._spinning)) {
      clearInterval(this._spinTimer);
      this._spinTimer = null;
    }
  }

  _startItemSpinner(options) {
    if (this._shouldLogItem() && !options.spinTimer) {
      let spinner = options.spinner;
      if (spinner === true) {
        spinner = VisualLogger.spinners[1];
      } else if (spinner >= 0 && spinner < VisualLogger.spinners.length) {
        spinner = VisualLogger.spinners[spinner];
      }
      options.spinner = spinner;

      if (options.spinner) {
        options._spinning = SPIN_STARTED;
        options.spinIx = 0;
        if (options.spinInterval === DEFAULT_SPINNER_INTERVAL) {
          this._startSpinTimer();
        } else {
          options.spinTimer = setInterval(() => {
            this.updateItem(options.name);
          }, options.spinInterval).unref();
        }
      }
    }
  }

  _stopItemSpinner(options) {
    options._spinning = SPIN_OFF;
    if (options.spinTimer) {
      clearInterval(options.spinTimer);
      options.spinTimer = undefined;
    }
    this._stopSpinTimer();

    return this;
  }

  _renderOutput() {
    if (!this._renderTimer && this._shouldLogItem() && this._lines.length > 0) {
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._output.visual.write(this._lines.join("\n"));
      }, this._renderInterval).unref();
    }
    return this;
  }

  _renderLine(options) {
    const spin =
      options.spinner && Number.isInteger(options.spinIx)
        ? `${options.spinner[options.spinIx]} `
        : "";
    return `${spin}${options._msg}`;
  }

  _renderLineMsg(options, data) {
    let display, msg;
    if (typeof data === "string") {
      msg = data;
    } else {
      msg = data.msg;
      display = data.display && this._colorize(options.color, data.display);
    }
    options._msg = `${display || options._display}: ${msg}`;
    return options._msg;
  }

  _save(line) {
    if (this._options.saveLogs !== false) {
      this._logData.push(line);
    }
  }

  _genLog(level, args) {
    let prefix;

    if (this._prefix !== undefined) {
      prefix = this._prefix || "";
      this.prefix();
    } else {
      //
      // In case chalk color support level changed, potentially by some user code,
      // then update the default prefix colors again
      //
      if (this._chalkLevel !== chalk.level) {
        this.setPrefix(this._defaultPrefix);
      }
      prefix = this._colorPrefix[level];
    }

    const str = `${prefix}${util.format.apply(util, args)}`;
    this._save(str);

    return str;
  }

  _log(l, args) {
    const str = this._genLog(l, args);

    if (Levels[l] >= this._logLevel) {
      this.clearItems();
      this._resetSimpleDots();
      this._output.write(`${str}\n`);
      this._renderOutput();
    }

    return this;
  }

  _shouldLogItem() {
    return this._itemType === LogItemTypes.normal && this._logLevel <= VisualLogger.Levels.info;
  }
}

module.exports = VisualLogger;

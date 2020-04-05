"use strict";

/* eslint-disable prefer-spread, one-var, max-statements, no-magic-numbers */

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

class VisualLogger {
  constructor(options) {
    options = options || {};
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

    options = Object.assign({}, options);
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
      if (data === undefined) {
        if (!options.spinner) return this;
        options.spinIx++;
        if (options.spinIx >= options.spinner.length) {
          options.spinIx = 0;
        }
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
        const interval = options.spinInterval || DEFAULT_SPINNER_INTERVAL;
        if (options.spinIx === undefined) options.spinIx = 0;
        options.spinTimer = setInterval(() => {
          this.updateItem(options.name);
        }, interval).unref();
      }
    }
  }

  _stopItemSpinner(options) {
    if (options.spinTimer) {
      clearInterval(options.spinTimer);
      options.spinTimer = undefined;
    }

    return this;
  }

  _renderOutput() {
    if (this._shouldLogItem() && this._lines.length > 0) {
      this._output.visual.write(this._lines.join("\n"));
    }
    return this;
  }

  _renderLine(options) {
    const spin =
      options.spinner && options.spinIx !== undefined ? `${options.spinner[options.spinIx]} ` : "";
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

'use strict';

var path = require('path');
var os = require('os');
var profiler = require('v8-profiler');
var usage = require('usage');
var writefile = require('writefile');
var objectAssign = require('object-assign');
var debug = require('debug')('v8-perf-shield');
var log4js = require('log4js');
var logger = log4js.getLogger();
var pid = process.pid;
var logsPath = process.env.V8_PERF_SHIELD_LOG_PATH || process.cwd();
var lastUsage = 0;
var currentUsage = 0;
var profilingPending = false;
var usageHistory = [];


var emergencyAction = function (usageHistory) {
    logger.warn('emergencyAction done.');
};

var emergencyCondition = function (lastUsage, currentUsage, usageHistory) {
    if (lastUsage.cpu > 50 && currentUsage.cpu > 50) {
        return true;
    }
};

var shieldOptions = {
    logsPath: logsPath,
    samplingTime: 60,
    flushTime: 3,
    cacheMaxLimit: 100,
    usageOptions: { keepHistory: true },
    emergencyCondition: emergencyCondition,
    emergencyAction: emergencyAction
};

var takeSnapshotAndSave = function (callback) {
    var uuid = os.hostname() + Date.now();
    var snapshot = profiler.takeSnapshot();
    var saveFilePath = path.join(shieldOptions.logsPath, uuid + '.snapshot');

    debug('takeSnapshotAndSave start');

    snapshot.export(function (err, result) {
        if (err) {
            return callback(err);
        }

        debug('takeSnapshotAndSave write');

        writefile(saveFilePath, result, function () {
            snapshot.delete();
            debug('takeSnapshotAndSave saved');
        });
    });
};

var takeProfilerAndSave = function (callback, samplingTime) {
    var uuid = os.hostname() + Date.now();
    var profile = profiler.startProfiling(uuid, true);
    var saveFilePath = path.join(shieldOptions.logsPath, uuid + '.cpuprofile');
    var stopProfilingAndSave = function () {
        debug('takeProfilerAndSave stop');
        callback = callback || function () {};
        profile = profiler.stopProfiling();
        profile.export(function (err, result) {
            if (err) {
                return callback(err);
            }

            debug('takeProfilerAndSave write');

            writefile(saveFilePath, result, function () {
                profile.delete();
                callback(profile);
                debug('takeProfilerAndSave saved');
            });
        });
    };

    debug('takeProfilerAndSave start');
    setTimeout(stopProfilingAndSave, samplingTime * 1000);
};

var cpuUsageLook = function () {
    debug('cpuUsageLook executed');

    usage.lookup(pid, shieldOptions.usageOptions, function (err, result) {
        if (err) {
            return logger.error('someError(s) occured in usage');
        }

        if (usageHistory.length === shieldOptions.cacheMaxLimit) {
            debug('usageHistory reache the limits');
            usageHistory.shift();
        }

        if (profilingPending === true) {
            return debug('profilingPending and return');
        }

        lastUsage = currentUsage;
        currentUsage = result;
        usageHistory.push(currentUsage);

        if (shieldOptions.emergencyCondition(lastUsage, currentUsage, usageHistory)) {
            debug('emergencyCondition true');
            profilingPending = true;
            takeSnapshotAndSave();

            takeProfilerAndSave(function () {
                debug('emergencyAction enter');
                shieldOptions.emergencyAction(usageHistory);
                profilingPending = false;
            }, shieldOptions.samplingTime);
        }
    });
};

var perfShield = function (options) {
    objectAssign(shieldOptions, options);
    setInterval(cpuUsageLook, shieldOptions.flushTime * 1000);
};

module.exports = perfShield;

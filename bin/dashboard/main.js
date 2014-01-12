// Requires
var gui = require('nw.gui');

var pathresolve = require('path').resolve;
var child_process = require('child_process');

var Q = require('q');
var _ = require('underscore');

// Port allocation
var qClass = require('qpatch').qClass;
var harbor = qClass(require('harbor'));
var ports = new harbor(19000, 20000);

// Local requires
var codebox = require('../../index.js');


// IDEs
var instances = {};
var windows = {};

// DOM elements
var $directorySelector = $('#directory-selector');
var $projectList = $('#projects');
var $btnOpen = $("#open-new");


// Local storage
var storageGet = function(key, def) {
    try {
        return JSON.parse(localStorage[key]);
    } catch(err) {
        return localStorage[key] || def;
    }
};
var storageSet = function(key, value) {
    localStorage[key] = JSON.stringify(value);
};


// Update list of projects
var updateProjects = function() {
    var projects = storageGet("projects");
    $projectList.empty();

    if (projects.length === 0) {
        $projectList.append($("<div>", {
            'class': "empty-message",
            'text': "No recent folders"
        }));
    }


    projects.reverse().forEach(function(path) {
        var $project = $("<li>", {
            'class': "project",
            "project": path
        });
        $("<p>", {
            'text': path.split("/").pop(),
            'class': 'project-title'
        }).appendTo($project);
        $("<p>", {
            'text': path,
            'class': 'project-path'
        }).appendTo($project);

        $projectList.append($project);
    });

    return projects.length > 0;
};

// Add a path to the projects list
var addProject = function(path) {
    var projects = storageGet("projects");

    if (projects.indexOf(path) >= 0) return;

    projects.push(path);
    storageSet("projects", projects);
    updateProjects();
};

// Select new project
var selectPath = function() {
    $directorySelector.click();
};

var openWindow = function(url) {
    if (windows[url]) {
        windows[url].focus();
        return;
    }

    var win = gui.Window.open(url, {
        'title': "Codebox",
        'position': 'center',
        'width': 1024,
        'height': 768,
        'min_height': 400,
        'min_width': 400,
        'show':true,
        'toolbar': false,
        'frame': true
    });
    windows[url] = win;

    win.on("close", function() {
        windows[url] = null;
        this.close(true);
    });

    return win;
};

// Kind of hackish way to
// Detect when a codebox instance is booted
function waitForBoot(child) {
    var d = Q.defer();
    var booted = false;

    // Check for successful boot
    var onData = function(data) {
        if(data.indexOf('Server is listening on') !== -1) {
            booted = true;
            return d.resolve();
        }
    };

    // Check if it exited normally or failed during boot
    var onError = function(err) {
        if(!booted) {
            return d.reject(err);
        }
    };

    // Handle success
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    // Handle failure
    child.on('exit', onError);
    child.on('error', onError);

    return d.promise;
}

var runCodebox = function(path) {
    if (instances[path]) {
        openWindow(instances[path].url);
        return;
    }

    // Claim port
    return ports.claim(path)
    .then(function(port) {
        // Setup url
        var url = "http://localhost:"+port;
        instances[path] = {
            'url': url
        };
        return [port, url];
    })
    .spread(function (port, url) {
        // Fork using the current node process (node-webkit)
        var child = child_process.execFile(
            pathresolve(process.cwd(), 'bin/codebox.js'), [
                'run'
            ], {
            'env': _.defaults({
                // Workspace directory
                WORKSPACE_DIR: path,

                // Port to run the server on
                PORT: port,

                // We aren't interested in the offline module
                // when the running on the desktop
                WORKSPACE_ADDONS_BLACKLIST: ["cb.offline"]
            }, process.env)
        });

        // Kind of hackish way to det

        return waitForBoot(child)
        .then(function() {
            return url;
        });
    })
    .then(function(url) {
        openWindow(url);

    })
    .fail(function(err) {
        console.error('Error initializing CodeBox');
        console.error(err);
        console.error(err.stack);
    });
};

// Bind events
$directorySelector.change(function handleFileSelect(evt) {
    var path = $(this).val();
    addProject(path);
    runCodebox(path);
});
$btnOpen.click(function(e) {
    e.preventDefault();
    selectPath();
});
$projectList.on("click", ".project", function(e) {
    e.preventDefault();
    runCodebox($(e.currentTarget).attr("project"));
});

// Start
if (!updateProjects()) {
    selectPath();
}
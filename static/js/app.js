
"use strict";

/* =====================================================
   ROTC COMMAND MANAGEMENT SYSTEM
   TACTICAL COMBAT EDITION
   Flask + Firebase Cloud Firestore
===================================================== */


/* =====================================================
   1. CONFIGURATION
===================================================== */

const API = "/api";

const CSRF = document
    .querySelector('meta[name="csrf-token"]')
    .getAttribute("content");

const $ = id => document.getElementById(id);

const COLLECTIONS = [
    "cadets",
    "training_schedules",
    "attendance",
    "announcements",
    "users"
];

const database = {
    cadets: [],
    training_schedules: [],
    attendance: [],
    announcements: [],
    users: []
};

let currentPage = "dashboard";
let currentView = "table";

let searchQuery = "";
let filterValue = "";
let platoonFilter = "";

let pageNumber = 1;
let pageSize = 10;

let editingId = null;
let formResource = null;
let pendingDelete = null;

let busy = false;
let loading = false;
let loadVersion = 0;


/* =====================================================
   2. ORIGINAL FIRESTORE FIELD CONFIGURATION
===================================================== */

const CONFIG = {

    dashboard: {
        title: "Command Center",
        icon: "dashboard"
    },

    cadets: {

        title: "Cadet Registry",
        singular: "Cadet",
        icon: "users",
        illustration: "cadet",

        description:
            "Manage cadet profiles, academic information, platoon assignments and service status.",

        filterField: "status",

        filterOptions: [
            "Active",
            "Inactive"
        ],

        fields: [

            {
                name: "student_id",
                label: "Student ID",
                type: "text",
                required: true
            },

            {
                name: "full_name",
                label: "Full Name",
                type: "text",
                required: true
            },

            {
                name: "course",
                label: "Course",
                type: "text",
                required: true
            },

            {
                name: "year_level",
                label: "Year Level",
                type: "number",
                min: 1,
                max: 4,
                required: true
            },

            {
                name: "platoon",
                label: "Platoon",
                type: "text",
                suggestions: [
                    "Alpha",
                    "Bravo",
                    "Charlie",
                    "Delta"
                ],
                required: true
            },

            {
                name: "status",
                label: "Status",
                type: "select",
                options: [
                    "Active",
                    "Inactive"
                ],
                required: true,
                default: "Active"
            }

        ]

    },

    training_schedules: {

        title: "Training Schedules",
        singular: "Training Schedule",
        icon: "calendar",
        illustration: "cap",

        description:
            "Organize scheduled training activities, locations and assigned instructors.",

        filterField: "training_date",

        fields: [

            {
                name: "title",
                label: "Training Title",
                type: "text",
                required: true
            },

            {
                name: "training_date",
                label: "Training Date",
                type: "date",
                required: true
            },

            {
                name: "start_time",
                label: "Start Time",
                type: "time",
                required: true
            },

            {
                name: "location",
                label: "Training Location",
                type: "text",
                required: true
            },

            {
                name: "instructor",
                label: "Instructor",
                type: "text",
                required: true
            },

            {
                name: "description",
                label: "Description",
                type: "textarea",
                required: false
            }

        ]

    },

    attendance: {

        title: "Attendance Monitoring",
        singular: "Attendance Record",
        icon: "check",
        illustration: "dogtag",

        description:
            "Record cadet attendance and monitor participation in scheduled training sessions.",

        filterField: "status",

        filterOptions: [
            "Present",
            "Late",
            "Absent",
            "Excused"
        ],

        fields: [

            {
                name: "cadet_id",
                label: "Cadet",
                type: "reference",
                collection: "cadets",
                required: true
            },

            {
                name: "training_id",
                label: "Training Schedule",
                type: "reference",
                collection: "training_schedules",
                required: true
            },

            {
                name: "status",
                label: "Attendance Status",
                type: "select",
                options: [
                    "Present",
                    "Late",
                    "Absent",
                    "Excused"
                ],
                required: true,
                default: "Present"
            },

            {
                name: "remarks",
                label: "Remarks",
                type: "textarea",
                required: false
            }

        ]

    },

    announcements: {

        title: "Announcements",
        singular: "Announcement",
        icon: "megaphone",
        illustration: "shield",

        description:
            "Publish important notices, training advisories and urgent command announcements.",

        filterField: "category",

        filterOptions: [
            "General",
            "Training",
            "Urgent"
        ],

        fields: [

            {
                name: "title",
                label: "Announcement Title",
                type: "text",
                required: true
            },

            {
                name: "content",
                label: "Announcement Content",
                type: "textarea",
                required: true
            },

            {
                name: "date_posted",
                label: "Date Posted",
                type: "date",
                required: true,
                default: "today"
            },

            {
                name: "category",
                label: "Category",
                type: "select",
                options: [
                    "General",
                    "Training",
                    "Urgent"
                ],
                required: true,
                default: "General"
            }

        ]

    },

    users: {

        title: "Personnel Management",
        singular: "Personnel Record",
        icon: "personnel",
        illustration: "uniform",

        description:
            "Manage registered ROTC personnel, staff codes and official designations.",

        filterField: "designation",

        fields: [

            {
                name: "staff_code",
                label: "Staff Code",
                type: "text",
                required: true
            },

            {
                name: "full_name",
                label: "Full Name",
                type: "text",
                required: true
            },

            {
                name: "designation",
                label: "Designation",
                type: "text",
                required: true
            }

        ]

    }

};


/* =====================================================
   3. GENERAL HELPERS
===================================================== */

function escapeHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, char => ({

        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"

    })[char]);

}


function icon(name, className = "icon") {

    return `
        <svg class="${className}" aria-hidden="true">
            <use href="#i-${name}"></use>
        </svg>
    `;

}


function today() {

    const now = new Date();

    return new Date(
        now.getTime() - now.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);

}


function formatDate(value) {

    if (!value) return "—";

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-PH", {

        month: "short",
        day: "numeric",
        year: "numeric"

    });

}


function formatTime(value) {

    if (!value) return "—";

    const parts = String(value).split(":");

    const hour = Number(parts[0]);

    if (!Number.isFinite(hour)) {
        return String(value);
    }

    return `${hour % 12 || 12}:${parts[1] || "00"} ${hour >= 12 ? "PM" : "AM"}`;

}


function percentage(part, total) {

    return total > 0
        ? Math.round((part / total) * 100)
        : 0;

}


function getRecord(resource, id) {

    return database[resource].find(
        record => String(record.id) === String(id)
    );

}


function referenceLabel(collection, id) {

    const record = getRecord(collection, id);

    if (!record) {
        return `Unknown reference (${id || "—"})`;
    }

    if (collection === "cadets") {

        return `${record.full_name} (${record.student_id})`;

    }

    if (collection === "training_schedules") {

        return `${record.title} — ${formatDate(record.training_date)}`;

    }

    return String(id);

}


function displayValue(field, value) {

    if (value === undefined ||
        value === null ||
        value === "") {

        return "—";

    }

    if (field.type === "reference") {

        return referenceLabel(field.collection, value);

    }

    if (field.type === "date") {

        return formatDate(value);

    }

    if (field.type === "time") {

        return formatTime(value);

    }

    return String(value);

}


function recordName(resource, record) {

    if (resource === "attendance") {

        return referenceLabel("cadets", record.cadet_id);

    }

    return record.full_name ||
        record.title ||
        record.student_id ||
        record.staff_code ||
        record.id;

}


/* =====================================================
   4. FLASK API REQUESTS
===================================================== */

class APIError extends Error {

    constructor(message, status) {

        super(message);

        this.name = "APIError";
        this.status = status;

    }

}


async function apiRequest(path, options = {}) {

    const method = options.method || "GET";

    const headers = {
        "Accept": "application/json"
    };

    if (method !== "GET") {

        headers["Content-Type"] = "application/json";
        headers["X-CSRF-Token"] = CSRF;

    }

    const requestOptions = {

        method,
        headers,
        credentials: "same-origin",
        cache: "no-store"

    };

    if (options.body !== undefined) {

        requestOptions.body = JSON.stringify(options.body);

    }

    let response;

    try {

        response = await fetch(`${API}${path}`, requestOptions);

    } catch (error) {

        throw new APIError(
            "Unable to connect to the Flask server.",
            0
        );

    }

    let result;

    try {

        result = await response.json();

    } catch (error) {

        throw new APIError(
            "The server returned an invalid response.",
            response.status
        );

    }

    if (!response.ok || result.success !== true) {

        throw new APIError(

            result.message || "Operation failed.",
            response.status

        );

    }

    return result;

}


async function loadCollection(resource) {

    const response = await apiRequest(`/${resource}`);

    if (!Array.isArray(response.data)) {

        throw new Error(
            `Invalid records returned for ${resource}.`
        );

    }

    return response.data;

}


/* =====================================================
   5. CONNECTION STATUS
===================================================== */

function setConnection(status) {

    const element = $("connectionStatus");

    element.classList.remove(
        "offline",
        "connecting"
    );

    if (status === "online") {

        $("connectionText").textContent =
            "FIRESTORE CONNECTED";

    } else if (status === "connecting") {

        element.classList.add("connecting");

        $("connectionText").textContent =
            "SYNCHRONIZING";

    } else {

        element.classList.add("offline");

        $("connectionText").textContent =
            "CONNECTION ERROR";

    }

}


/* =====================================================
   6. MILITARY NOTIFICATIONS
===================================================== */

function showToast(message, type = "success") {

    const titles = {

        success: "MISSION ACCOMPLISHED",
        error: "OPERATION FAILED",
        warning: "ATTENTION REQUIRED",
        info: "COMMAND UPDATE"

    };

    const icons = {

        success: "check",
        error: "close",
        warning: "warning",
        info: "shield"

    };

    if (!titles[type]) type = "info";

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    toast.innerHTML = `

        <div class="toast-symbol">
            ${icon(icons[type])}
        </div>

        <div class="toast-copy">

            <h4>${titles[type]}</h4>

            <p>${escapeHTML(message)}</p>

        </div>

        <button class="toast-close"
                aria-label="Dismiss notification">

            ${icon("close")}

        </button>

        <div class="toast-timer"></div>

    `;

    $("toastContainer").appendChild(toast);

    let dismissed = false;

    function dismiss() {

        if (dismissed) return;

        dismissed = true;

        toast.classList.add("leaving");

        setTimeout(() => toast.remove(), 200);

    }

    toast.querySelector(".toast-close")
        .addEventListener("click", dismiss);

    setTimeout(dismiss, 5000);

    const allToasts = $("toastContainer").children;

    if (allToasts.length > 4) {

        allToasts[0].remove();

    }

}


/* =====================================================
   7. RADAR LOADING
===================================================== */

function showLoading(message = "PROCESSING COMMAND") {

    $("loadingText").textContent = message;

    $("loadingOverlay").hidden = false;

}


function hideLoading() {

    $("loadingOverlay").hidden = true;

}


function setBusy(value) {

    busy = value;

    $("saveButton").disabled = value;
    $("cancelForm").disabled = value;
    $("closeDialog").disabled = value;

    $("confirmDelete").disabled = value;
    $("cancelDelete").disabled = value;

    $("refreshButton").disabled = value;

}


function renderSkeleton() {

    $("pageContent").innerHTML = `

        <div class="skeleton skeleton-hero"></div>

        <div class="stats-grid">

            ${Array.from({ length: 4 }, () => `
                <div class="skeleton skeleton-stat"></div>
            `).join("")}

        </div>

        <div class="panel">

            ${Array.from({ length: 5 }, () => `
                <div class="skeleton skeleton-row"></div>
            `).join("")}

        </div>

    `;

}


/* =====================================================
   8. LOAD REAL FIRESTORE DATA
===================================================== */

async function refreshData({
    skeleton = true,
    notify = false
} = {}) {

    const version = ++loadVersion;

    loading = true;

    setConnection("connecting");

    if (skeleton) {

        renderSkeleton();

    }

    try {

        const results = await Promise.all(

            COLLECTIONS.map(resource =>
                loadCollection(resource)
            )

        );

        if (version !== loadVersion) return false;

        COLLECTIONS.forEach((resource, index) => {

            database[resource] = results[index];

        });

        loading = false;

        setConnection("online");

        renderPage();

        if (notify) {

            showToast(
                "All command records have been synchronized."
            );

        }

        return true;

    } catch (error) {

        if (version !== loadVersion) return false;

        loading = false;

        setConnection("offline");

        $("pageContent").innerHTML = `

            <div class="panel">

                ${emptyState(

                    "CONNECTION INTERRUPTED",

                    error.message,

                    "retry",

                    "RETRY CONNECTION"

                )}

            </div>

        `;

        showToast(error.message, "error");

        return false;

    }

}


/* =====================================================
   9. SIDEBAR NAVIGATION
===================================================== */

function renderNavigation() {

    $("navigation").innerHTML = Object.entries(CONFIG)

        .map(([key, config]) => `

            <button class="nav-button
                    ${currentPage === key ? "active" : ""}"

                    data-page="${key}"

                    ${currentPage === key
                        ? 'aria-current="page"'
                        : ""}>

                ${icon(config.icon)}

                <span>${escapeHTML(config.title)}</span>

            </button>

        `).join("");

}


function navigate(page) {

    if (!CONFIG[page] || busy) return;

    currentPage = page;

    searchQuery = "";
    filterValue = "";
    platoonFilter = "";
    pageNumber = 1;

    closeMobileMenu();

    renderNavigation();

    $("pageTitle").textContent = CONFIG[page].title;

    if (loading) {

        renderSkeleton();

    } else if (
        $("connectionStatus").classList.contains("offline")
    ) {

        refreshData();

    } else {

        renderPage();

    }

    window.scrollTo({
        top: 0,
        behavior: "instant"
    });

}


/* =====================================================
   10. DASHBOARD HERO
===================================================== */

function dashboardHero() {

    return `

        <section class="hero">

            <div class="hero-copy">

                <span class="eyebrow">

                    ★ RESERVE OFFICERS' TRAINING CORPS

                </span>

                <h2>

                    READY TO LEAD.<br>

                    <span>READY TO SERVE.</span>

                </h2>

                <p>

                    Your centralized tactical workspace for
                    cadet management, training schedules,
                    attendance monitoring and command operations.

                </p>

                <div class="hero-actions">

                    <button class="btn btn-gold"
                            data-page="cadets">

                        ${icon("users")}

                        VIEW CADETS

                    </button>

                    <button class="btn btn-outline"
                            data-page="attendance">

                        ${icon("check")}

                        RECORD ATTENDANCE

                    </button>

                </div>

            </div>

            <div class="hero-art" aria-hidden="true">

                <div class="hero-orbit"></div>

                ${icon("cadet", "hero-cadet")}

                ${icon("cap", "floating-cap")}

                ${icon("dogtag", "floating-tag")}

            </div>

        </section>

    `;

}


/* =====================================================
   11. ANIMATED STATISTICS
===================================================== */

function statCard(label, value, note, iconName) {

    return `

        <article class="stat-card">

            <div class="stat-top">

                <span class="stat-label">
                    ${escapeHTML(label)}
                </span>

                <div class="stat-icon">
                    ${icon(iconName)}
                </div>

            </div>

            <strong class="stat-value"
                    data-count="${Number(value)}">

                0

            </strong>

            <span class="stat-note">

                ${escapeHTML(note)}

            </span>

        </article>

    `;

}


function animateCounters() {

    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    document.querySelectorAll("[data-count]")

        .forEach(element => {

            const target = Number(element.dataset.count);

            if (reducedMotion) {

                element.textContent =
                    target.toLocaleString();

                return;

            }

            const duration = 650;
            const start = performance.now();

            function animate(now) {

                if (!element.isConnected) return;

                const progress = Math.min(
                    (now - start) / duration,
                    1
                );

                const eased =
                    1 - Math.pow(1 - progress, 3);

                element.textContent = Math.round(
                    target * eased
                ).toLocaleString();

                if (progress < 1) {

                    requestAnimationFrame(animate);

                }

            }

            requestAnimationFrame(animate);

        });

}


/* =====================================================
   12. DASHBOARD PROGRESS BARS
===================================================== */

function progressBar(label, count, total, className = "") {

    const percent = percentage(count, total);

    return `

        <div class="progress-item">

            <div class="progress-label">

                <span>${escapeHTML(label)}</span>

                <span>${count} · ${percent}%</span>

            </div>

            <div class="progress-track"
                 role="progressbar"
                 aria-label="${escapeHTML(label)}"
                 aria-valuemin="0"
                 aria-valuemax="100"
                 aria-valuenow="${percent}">

                <span class="progress-fill ${className}"
                      style="--progress:${percent}%">

                </span>

            </div>

        </div>

    `;

}


function renderDashboard() {

    const cadets = database.cadets;
    const schedules = database.training_schedules;
    const attendance = database.attendance;
    const announcements = database.announcements;
    const personnel = database.users;

    const activeCadets = cadets.filter(
        record => record.status === "Active"
    ).length;

    const present = attendance.filter(
        record => record.status === "Present"
    ).length;

    const late = attendance.filter(
        record => record.status === "Late"
    ).length;

    const absent = attendance.filter(
        record => record.status === "Absent"
    ).length;

    const excused = attendance.filter(
        record => record.status === "Excused"
    ).length;

    const upcoming = schedules

        .filter(record =>
            record.training_date >= today()
        )

        .sort((a, b) =>

            `${a.training_date} ${a.start_time}`

                .localeCompare(
                    `${b.training_date} ${b.start_time}`
                )

        )

        .slice(0, 5);

    const latestAnnouncements = [...announcements]

        .sort((a, b) =>

            String(b.date_posted || "")
                .localeCompare(String(a.date_posted || ""))

        )

        .slice(0, 5);

    const platoons = [

        ...new Set([

            "Alpha",
            "Bravo",
            "Charlie",
            "Delta",

            ...cadets
                .map(record => record.platoon)
                .filter(Boolean)

        ])

    ];

    $("pageContent").innerHTML = `

        <div class="page-enter">

            ${dashboardHero()}

            <section class="stats-grid">

                ${statCard(
                    "REGISTERED CADETS",
                    cadets.length,
                    `${activeCadets} active cadets`,
                    "users"
                )}

                ${statCard(
                    "TRAINING SCHEDULES",
                    schedules.length,
                    "Total scheduled activities",
                    "calendar"
                )}

                ${statCard(
                    "ATTENDANCE RECORDS",
                    attendance.length,
                    `${percentage(
                        present + late,
                        attendance.length
                    )}% recorded participation`,
                    "check"
                )}

                ${statCard(
                    "ROTC PERSONNEL",
                    personnel.length,
                    "Registered personnel",
                    "personnel"
                )}

            </section>

            <div class="dashboard-grid">

                <section class="panel">

                    <div class="panel-header">

                        <div>

                            <h3>PLATOON STRENGTH</h3>

                            <p>Cadet distribution by platoon</p>

                        </div>

                        ${icon("users")}

                    </div>

                    <div class="panel-body">

                        ${platoons.map(platoon => {

                            const count = cadets.filter(
                                record => record.platoon === platoon
                            ).length;

                            return progressBar(

                                `${platoon} Platoon`,

                                count,

                                cadets.length

                            );

                        }).join("")}

                    </div>

                </section>

                <section class="panel">

                    <div class="panel-header">

                        <div>

                            <h3>ATTENDANCE PERFORMANCE</h3>

                            <p>Distribution of recorded attendance</p>

                        </div>

                        ${icon("check")}

                    </div>

                    <div class="panel-body">

                        ${progressBar(
                            "Present",
                            present,
                            attendance.length
                        )}

                        ${progressBar(
                            "Late",
                            late,
                            attendance.length,
                            "late"
                        )}

                        ${progressBar(
                            "Absent",
                            absent,
                            attendance.length,
                            "absent"
                        )}

                        ${progressBar(
                            "Excused",
                            excused,
                            attendance.length,
                            "excused"
                        )}

                    </div>

                </section>

            </div>

            <div class="dashboard-grid">

                <section class="panel">

                    <div class="panel-header">

                        <div>

                            <h3>UPCOMING TRAINING</h3>

                            <p>Scheduled command activities</p>

                        </div>

                        <button class="btn btn-secondary btn-small"
                                data-page="training_schedules">

                            VIEW ALL

                        </button>

                    </div>

                    <div class="panel-body">

                        ${upcoming.length
                            ? upcoming.map(record => `

                                <div class="activity-item">

                                    <div class="activity-icon">

                                        ${icon("calendar")}

                                    </div>

                                    <div>

                                        <strong>

                                            ${escapeHTML(record.title)}

                                        </strong>

                                        <p>

                                            ${escapeHTML(
                                                formatDate(record.training_date)
                                            )}

                                            ·

                                            ${escapeHTML(
                                                formatTime(record.start_time)
                                            )}

                                        </p>

                                        <p>

                                            ${escapeHTML(record.location)}

                                        </p>

                                    </div>

                                </div>

                            `).join("")
                            : `<p class="muted">
                                No upcoming training schedules.
                               </p>`
                        }

                    </div>

                </section>

                <section class="panel">

                    <div class="panel-header">

                        <div>

                            <h3>COMMAND ANNOUNCEMENTS</h3>

                            <p>${announcements.length} published notices</p>

                        </div>

                        <button class="btn btn-secondary btn-small"
                                data-page="announcements">

                            VIEW ALL

                        </button>

                    </div>

                    <div class="panel-body">

                        ${latestAnnouncements.length
                            ? latestAnnouncements.map(record => `

                                <div class="activity-item">

                                    <div class="activity-icon">

                                        ${icon("megaphone")}

                                    </div>

                                    <div>

                                        <strong>

                                            ${escapeHTML(record.title)}

                                        </strong>

                                        <p>

                                            ${escapeHTML(
                                                formatDate(record.date_posted)
                                            )}

                                        </p>

                                        ${statusBadge(record.category)}

                                    </div>

                                </div>

                            `).join("")
                            : `<p class="muted">
                                No command announcements available.
                               </p>`
                        }

                    </div>

                </section>

            </div>

        </div>

    `;

    animateCounters();

}


/* =====================================================
   13. MODULE HERO
===================================================== */

function moduleHero(resource) {

    const config = CONFIG[resource];

    return `

        <section class="hero module-hero">

            <div class="hero-copy">

                <span class="eyebrow">

                    ★ COMMAND RECORD MANAGEMENT

                </span>

                <h2>${escapeHTML(config.title.toUpperCase())}</h2>

                <p>${escapeHTML(config.description)}</p>

            </div>

            <div class="hero-art" aria-hidden="true">

                <div class="hero-orbit"></div>

                ${icon(config.illustration, "hero-cadet")}

            </div>

        </section>

    `;

}


/* =====================================================
   14. SEARCH AND FILTER OPTIONS
===================================================== */

function filterOptions(resource) {

    const config = CONFIG[resource];

    if (config.filterOptions) {

        return config.filterOptions;

    }

    return [...new Set(

        database[resource]

            .map(record => record[config.filterField])

            .filter(Boolean)

            .map(String)

    )].sort();

}


function getFilteredRecords() {

    const resource = currentPage;

    const config = CONFIG[resource];

    const query = searchQuery.trim().toLowerCase();

    return database[resource].filter(record => {

        const matchesSearch = !query ||

            Object.values(record)

                .some(value =>
                    String(value ?? "")
                        .toLowerCase()
                        .includes(query)
                ) ||

            config.fields.some(field =>

                displayValue(field, record[field.name])

                    .toLowerCase()

                    .includes(query)

            );

        const matchesFilter = !filterValue ||

            String(record[config.filterField]) === filterValue;

        const matchesPlatoon =

            resource !== "cadets" ||

            !platoonFilter ||

            record.platoon === platoonFilter;

        return matchesSearch &&
            matchesFilter &&
            matchesPlatoon;

    });

}


/* =====================================================
   15. MODULE TOOLBAR
===================================================== */

function renderModule(resource) {

    const config = CONFIG[resource];

    const options = filterOptions(resource);

    const platoons = [...new Set(

        database.cadets
            .map(record => record.platoon)
            .filter(Boolean)

    )].sort();

    $("pageContent").innerHTML = `

        <div class="page-enter">

            ${moduleHero(resource)}

            <section class="panel">

                <div class="panel-header">

                    <div>

                        <span class="eyebrow">
                            FIRESTORE RECORDS
                        </span>

                        <h3>${escapeHTML(config.title)}</h3>

                        <p id="recordCount"></p>

                    </div>

                    <button class="btn btn-gold"
                            data-action="add">

                        ${icon("plus")}

                        ADD ${escapeHTML(config.singular.toUpperCase())}

                    </button>

                </div>

                <div class="toolbar">

                    <div class="toolbar-group">

                        <div class="search-box">

                            ${icon("search")}

                            <input id="searchInput"
                                   type="search"
                                   aria-label="Search records"
                                   placeholder="Search records..."
                                   value="${escapeHTML(searchQuery)}">

                        </div>

                        <select id="filterSelect"
                                class="filter-select"
                                aria-label="Filter records">

                            <option value="">All records</option>

                            ${options.map(value => `

                                <option value="${escapeHTML(value)}"

                                    ${filterValue === String(value)
                                        ? "selected"
                                        : ""}>

                                    ${escapeHTML(value)}

                                </option>

                            `).join("")}

                        </select>

                        ${resource === "cadets" ? `

                            <select id="platoonFilter"
                                    class="filter-select"
                                    aria-label="Filter platoon">

                                <option value="">
                                    All platoons
                                </option>

                                ${platoons.map(value => `

                                    <option value="${escapeHTML(value)}"

                                        ${platoonFilter === value
                                            ? "selected"
                                            : ""}>

                                        ${escapeHTML(value)}

                                    </option>

                                `).join("")}

                            </select>

                        ` : ""}

                    </div>

                    <div class="toolbar-group">

                        <div class="view-switch">

                            <button class="view-button
                                    ${currentView === "table"
                                        ? "active" : ""}"

                                    data-view="table"
                                    title="Table view"
                                    aria-label="Table view"
                                    aria-pressed="${currentView === "table"}">

                                ${icon("table")}

                            </button>

                            <button class="view-button
                                    ${currentView === "cards"
                                        ? "active" : ""}"

                                    data-view="cards"
                                    title="Card view"
                                    aria-label="Card view"
                                    aria-pressed="${currentView === "cards"}">

                                ${icon("dashboard")}

                            </button>

                        </div>

                        <button class="btn btn-export btn-small"
                                data-action="export">

                            ${icon("download")} CSV

                        </button>

                        <button class="btn btn-print btn-small"
                                data-action="print">

                            ${icon("print")} PRINT

                        </button>

                    </div>

                </div>

                <div id="recordsContainer"></div>

                <div id="pagination"
                     class="pagination"></div>

            </section>

        </div>

    `;

    $("searchInput").addEventListener("input", event => {

        searchQuery = event.target.value;

        pageNumber = 1;

        renderRecords();

    });

    $("filterSelect").addEventListener("change", event => {

        filterValue = event.target.value;

        pageNumber = 1;

        renderRecords();

    });

    if ($("platoonFilter")) {

        $("platoonFilter").addEventListener("change", event => {

            platoonFilter = event.target.value;

            pageNumber = 1;

            renderRecords();

        });

    }

    renderRecords();

}


/* =====================================================
   16. STATUS AND PLATOON BADGES
===================================================== */

function statusBadge(value) {

    const allowed = [

        "active",
        "inactive",
        "present",
        "late",
        "absent",
        "excused",
        "general",
        "training",
        "urgent"

    ];

    const key = String(value || "").toLowerCase();

    const className = allowed.includes(key)
        ? `status-${key}`
        : "status-general";

    return `

        <span class="status-badge ${className}">

            ${escapeHTML(value || "—")}

        </span>

    `;

}


function platoonBadge(value) {

    const key = String(value || "").toLowerCase();

    const allowed = [

        "alpha",
        "bravo",
        "charlie",
        "delta"

    ];

    const className = allowed.includes(key)
        ? `platoon-${key}`
        : "platoon-other";

    return `

        <span class="platoon-badge ${className}">

            ◆ ${escapeHTML(value || "—")}

        </span>

    `;

}


function renderField(field, value) {

    if (field.name === "status" ||
        field.name === "category") {

        return statusBadge(value);

    }

    if (field.name === "platoon") {

        return platoonBadge(value);

    }

    return escapeHTML(displayValue(field, value));

}


/* =====================================================
   17. CRUD ACTION BUTTONS
===================================================== */

function actionButtons(record) {

    const id = escapeHTML(record.id);

    return `

        <div class="record-actions">

            <button class="btn btn-view btn-small"
                    data-action="view"
                    data-id="${id}"
                    title="View record">

                ${icon("eye")}

                VIEW

            </button>

            <button class="btn btn-edit btn-small"
                    data-action="edit"
                    data-id="${id}"
                    title="Edit record">

                ${icon("edit")}

                EDIT

            </button>

            <button class="btn btn-delete btn-small"
                    data-action="delete"
                    data-id="${id}"
                    title="Delete record">

                ${icon("trash")}

                DELETE

            </button>

        </div>

    `;

}


/* =====================================================
   18. TABLE VIEW
===================================================== */

function renderTable(records, resource) {

    const config = CONFIG[resource];

    return `

        <div class="table-wrapper">

            <table>

                <thead>

                    <tr>

                        ${config.fields.map(field => `

                            <th>${escapeHTML(field.label)}</th>

                        `).join("")}

                        <th class="no-print">Actions</th>

                    </tr>

                </thead>

                <tbody>

                    ${records.map(record => `

                        <tr>

                            ${config.fields.map(field => {

                                if (
                                    resource === "cadets" &&
                                    field.name === "full_name"
                                ) {

                                    return `

                                        <td>

                                            <div class="table-person">

                                                ${icon(
                                                    "cadet",
                                                    "table-avatar"
                                                )}

                                                <strong>

                                                    ${escapeHTML(
                                                        record.full_name
                                                    )}

                                                </strong>

                                            </div>

                                        </td>

                                    `;

                                }

                                return `

                                    <td title="${escapeHTML(
                                        displayValue(
                                            field,
                                            record[field.name]
                                        )
                                    )}">

                                        ${renderField(
                                            field,
                                            record[field.name]
                                        )}

                                    </td>

                                `;

                            }).join("")}

                            <td class="no-print">

                                ${actionButtons(record)}

                            </td>

                        </tr>

                    `).join("")}

                </tbody>

            </table>

        </div>

    `;

}


/* =====================================================
   19. MILITARY DOG TAG CARD VIEW
===================================================== */

function renderCards(records, resource) {

    const config = CONFIG[resource];

    return `

        <div class="records-grid">

            ${records.map(record => {

                const name = recordName(resource, record);

                const reference =

                    record.student_id ||

                    record.staff_code ||

                    String(record.id).slice(0, 12);

                return `

                    <article class="record-card">

                        <div class="dogtag-hole"></div>

                        <div class="card-cover">

                            ${resource === "cadets"

                                ? icon("cadet", "card-cadet")

                                : icon(
                                    config.illustration,
                                    "card-symbol"
                                )

                            }

                        </div>

                        <div class="card-body">

                            <h3>${escapeHTML(name)}</h3>

                            <div class="card-reference">

                                ${escapeHTML(reference)}

                            </div>

                            ${config.fields

                                .filter(field =>

                                    field.name !== "full_name" &&

                                    field.name !== "title" &&

                                    field.name !== "student_id" &&

                                    field.name !== "staff_code"

                                )

                                .map(field => `

                                    <div class="card-detail">

                                        <span>

                                            ${escapeHTML(field.label)}

                                        </span>

                                        <span>

                                            ${renderField(
                                                field,
                                                record[field.name]
                                            )}

                                        </span>

                                    </div>

                                `).join("")}

                        </div>

                        <div class="card-footer">

                            ${actionButtons(record)}

                        </div>

                    </article>

                `;

            }).join("")}

        </div>

    `;

}


/* =====================================================
   20. EMPTY STATE
===================================================== */

function emptyState(
    title,
    message,
    action = "add",
    buttonText = "ADD RECORD"
) {

    return `

        <div class="empty-state">

            ${icon("dogtag", "empty-illustration")}

            <span class="eyebrow">COMMAND STATUS</span>

            <h3>${escapeHTML(title)}</h3>

            <p>${escapeHTML(message)}</p>

            <button class="btn btn-gold"
                    data-action="${escapeHTML(action)}">

                ${icon(action === "retry" ? "refresh" : "plus")}

                ${escapeHTML(buttonText)}

            </button>

        </div>

    `;

}


/* =====================================================
   21. PAGINATION
===================================================== */

function renderPagination(total) {

    const totalPages = Math.max(
        1,
        Math.ceil(total / pageSize)
    );

    const start = total
        ? (pageNumber - 1) * pageSize + 1
        : 0;

    const end = Math.min(
        pageNumber * pageSize,
        total
    );

    const firstPage = Math.max(
        1,
        Math.min(pageNumber - 2, totalPages - 4)
    );

    const lastPage = Math.min(
        totalPages,
        firstPage + 4
    );

    let buttons = "";

    for (let page = firstPage; page <= lastPage; page++) {

        buttons += `

            <button class="page-button
                    ${page === pageNumber ? "active" : ""}"

                    data-pagination="${page}"

                    aria-label="Page ${page}"

                    ${page === pageNumber
                        ? 'aria-current="page"'
                        : ""}>

                ${page}

            </button>

        `;

    }

    $("pagination").innerHTML = `

        <span class="pagination-info">

            Showing ${start}–${end} of ${total} records

        </span>

        <select id="pageSizeSelect"
                class="filter-select"
                aria-label="Records per page">

            ${[5, 10, 20, 50].map(size => `

                <option value="${size}"
                    ${pageSize === size ? "selected" : ""}>

                    ${size} per page

                </option>

            `).join("")}

        </select>

        <div class="pagination-buttons">

            <button class="page-button"
                    data-pagination="${pageNumber - 1}"
                    aria-label="Previous page"
                    ${pageNumber === 1 ? "disabled" : ""}>

                ‹

            </button>

            ${buttons}

            <button class="page-button"
                    data-pagination="${pageNumber + 1}"
                    aria-label="Next page"

                    ${pageNumber === totalPages
                        ? "disabled" : ""}>

                ›

            </button>

        </div>

    `;

    $("pageSizeSelect").addEventListener("change", event => {

        pageSize = Number(event.target.value);

        pageNumber = 1;

        renderRecords();

    });

}


function renderRecords() {

    const records = getFilteredRecords();

    const totalPages = Math.max(
        1,
        Math.ceil(records.length / pageSize)
    );

    pageNumber = Math.min(
        Math.max(1, pageNumber),
        totalPages
    );

    const start = (pageNumber - 1) * pageSize;

    const visible = records.slice(
        start,
        start + pageSize
    );

    $("recordCount").textContent =

        `${records.length} matching records · ` +

        `${database[currentPage].length} total records`;

    if (!records.length) {

        const filtered = Boolean(
            searchQuery || filterValue || platoonFilter
        );

        $("recordsContainer").innerHTML = filtered

            ? emptyState(

                "NO MATCHING RECORDS",

                "No records match your current search or filters.",

                "clear-filters",

                "CLEAR FILTERS"

            )

            : emptyState(

                "NO RECORDS AVAILABLE",

                "This collection is empty. Register a new record to begin.",

                "add",

                "ADD NEW RECORD"

            );

    } else {

        $("recordsContainer").innerHTML =

            currentView === "cards"

                ? renderCards(visible, currentPage)

                : renderTable(visible, currentPage);

    }

    renderPagination(records.length);

}


function renderPage() {

    $("pageTitle").textContent = CONFIG[currentPage].title;

    renderNavigation();

    if (currentPage === "dashboard") {

        renderDashboard();

    } else {

        renderModule(currentPage);

    }

}


/* =====================================================
   22. DYNAMIC FORM FIELDS
===================================================== */

function buildField(field, record = {}) {

    let value = record[field.name];

    if (value === undefined || value === null) {

        value = field.default === "today"

            ? today()

            : field.default ?? "";

    }

    const required = field.required ? "required" : "";

    const maxLength = [

        "content",
        "description",
        "remarks"

    ].includes(field.name) ? 3000 : 180;

    const fieldId = `field-${field.name}`;

    let control = "";

    if (field.type === "textarea") {

        control = `

            <textarea class="form-control"
                      id="${fieldId}"
                      name="${field.name}"
                      maxlength="${maxLength}"
                      ${required}>${escapeHTML(value)}</textarea>

        `;

    } else if (
        field.type === "select" ||
        field.type === "reference"
    ) {

        let options;

        if (field.type === "reference") {

            options = database[field.collection]

                .map(item => ({

                    value: item.id,

                    label: referenceLabel(
                        field.collection,
                        item.id
                    )

                }))

                .sort((a, b) =>
                    a.label.localeCompare(b.label)
                );

        } else {

            options = field.options.map(item => ({

                value: item,

                label: item

            }));

        }

        if (

            value &&

            !options.some(option =>
                String(option.value) === String(value)
            )

        ) {

            options.push({

                value,

                label: `Unavailable reference: ${value}`

            });

        }

        control = `

            <select class="form-control"
                    id="${fieldId}"
                    name="${field.name}"
                    ${required}>

                <option value="">Select ${escapeHTML(field.label)}</option>

                ${options.map(option => `

                    <option value="${escapeHTML(option.value)}"

                        ${String(value) === String(option.value)
                            ? "selected"
                            : ""}>

                        ${escapeHTML(option.label)}

                    </option>

                `).join("")}

            </select>

        `;

    } else {

        control = `

            <input class="form-control"
                   id="${fieldId}"
                   name="${field.name}"
                   type="${field.type}"
                   value="${escapeHTML(value)}"

                   ${field.type === "text"
                       ? `maxlength="${maxLength}"`
                       : ""}

                   ${field.min !== undefined
                       ? `min="${field.min}"`
                       : ""}

                   ${field.max !== undefined
                       ? `max="${field.max}"`
                       : ""}

                   ${field.type === "number"
                       ? 'step="1"'
                       : ""}

                   ${field.suggestions
                       ? `list="suggest-${field.name}"`
                       : ""}

                   ${required}>

            ${field.suggestions ? `

                <datalist id="suggest-${field.name}">

                    ${field.suggestions.map(option => `

                        <option value="${escapeHTML(option)}">

                    `).join("")}

                </datalist>

            ` : ""}

        `;

    }

    return `

        <div class="form-group
                    ${field.type === "textarea"
                        ? "full-width" : ""}">

            <label for="${fieldId}">

                ${escapeHTML(field.label)}

                ${field.required
                    ? '<span class="required-mark">*</span>'
                    : ""}

            </label>

            ${control}

        </div>

    `;

}


/* =====================================================
   23. OPEN ADD / EDIT DIALOG
===================================================== */

function openForm(resource, record = null) {

    if (busy || loading) return;

    if (resource === "attendance") {

        if (

            !database.cadets.length ||

            !database.training_schedules.length

        ) {

            showToast(

                "Register at least one cadet and training schedule before recording attendance.",

                "warning"

            );

            return;

        }

    }

    formResource = resource;

    editingId = record ? record.id : null;

    const config = CONFIG[resource];

    $("dialogTitle").textContent = record

        ? `Update ${config.singular}`

        : `Register ${config.singular}`;

    $("formError").hidden = true;

    $("saveButton").hidden = false;

    $("saveButton").innerHTML = `

        ${icon("check")}

        ${record ? "UPDATE RECORD" : "SAVE RECORD"}

    `;

    $("cancelForm").textContent = "CANCEL";

    $("formFields").innerHTML = config.fields

        .map(field => buildField(field, record || {}))

        .join("");

    $("recordDialog").showModal();

}


function closeRecordDialog() {

    if (busy) return;

    $("recordDialog").close();

    $("recordForm").reset();

    $("formError").hidden = true;

    editingId = null;

    formResource = null;

}


/* =====================================================
   24. READ SINGLE RECORD
===================================================== */

async function openDetails(resource, id) {

    if (busy || loading) return;

    setBusy(true);

    showLoading("RETRIEVING RECORD");

    try {

        const response = await apiRequest(

            `/${resource}/${encodeURIComponent(id)}`

        );

        const record = response.data;

        const config = CONFIG[resource];

        formResource = null;

        editingId = null;

        $("dialogTitle").textContent =
            `${config.singular} Details`;

        $("formError").hidden = true;

        $("saveButton").hidden = true;

        $("cancelForm").textContent = "CLOSE";

        $("formFields").innerHTML = config.fields

            .map(field => `

                <div class="form-group
                            ${field.type === "textarea"
                                ? "full-width" : ""}">

                    <label>${escapeHTML(field.label)}</label>

                    <div class="detail-value">

                        ${renderField(
                            field,
                            record[field.name]
                        )}

                    </div>

                </div>

            `).join("");

        $("recordDialog").showModal();

    } catch (error) {

        showToast(error.message, "error");

    } finally {

        hideLoading();

        setBusy(false);

    }

}


async function openEdit(resource, id) {

    if (busy || loading) return;

    setBusy(true);

    showLoading("RETRIEVING RECORD");

    let record = null;

    try {

        const response = await apiRequest(

            `/${resource}/${encodeURIComponent(id)}`

        );

        record = response.data;

    } catch (error) {

        showToast(error.message, "error");

    } finally {

        hideLoading();

        setBusy(false);

    }

    if (record) {

        openForm(resource, record);

    }

}


/* =====================================================
   25. CREATE AND UPDATE RECORDS
===================================================== */

$("recordForm").addEventListener("submit", async event => {

    event.preventDefault();

    if (busy || !formResource) return;

    const resource = formResource;

    const id = editingId;

    const config = CONFIG[resource];

    const formData = new FormData(event.target);

    const payload = {};

    for (const field of config.fields) {

        let value = String(
            formData.get(field.name) ?? ""
        ).trim();

        if (field.required && !value) {

            $("formError").textContent =
                `${field.label} is required.`;

            $("formError").hidden = false;

            return;

        }

        if (field.type === "number") {

            value = Number(value);

            if (

                !Number.isInteger(value) ||

                value < field.min ||

                value > field.max

            ) {

                $("formError").textContent =
                    `${field.label} must be between ` +
                    `${field.min} and ${field.max}.`;

                $("formError").hidden = false;

                return;

            }

        }

        payload[field.name] = value;

    }

    $("formError").hidden = true;

    setBusy(true);

    $("saveButton").textContent = "SAVING...";

    /*
       Native dialog elements appear above ordinary overlays.
       The save button therefore provides the visible loading
       response while the form dialog remains open.
    */

    try {

        const path = id

            ? `/${resource}/${encodeURIComponent(id)}`

            : `/${resource}`;

        const response = await apiRequest(path, {

            method: id ? "PUT" : "POST",

            body: payload

        });

        $("recordDialog").close();

        formResource = null;

        editingId = null;

        showToast(

            response.message ||

            `${config.singular} saved successfully.`,

            "success"

        );

        await refreshData({
            skeleton: false
        });

    } catch (error) {

        $("formError").textContent = error.message;

        $("formError").hidden = false;

        showToast(

            error.message,

            error.status === 409
                ? "warning"
                : "error"

        );

    } finally {

        setBusy(false);

        $("saveButton").innerHTML = `

            ${icon("check")}

            ${id ? "UPDATE RECORD" : "SAVE RECORD"}

        `;

    }

});


/* =====================================================
   26. DELETE CONFIRMATION
===================================================== */

function openDelete(resource, id) {

    if (busy || loading) return;

    const record = getRecord(resource, id);

    if (!record) {

        showToast("Record not found.", "warning");

        return;

    }

    pendingDelete = {
        resource,
        id
    };

    $("confirmMessage").textContent =

        `Are you sure you want to permanently delete ` +

        `"${recordName(resource, record)}"?`;

    $("confirmDialog").showModal();

}


$("confirmDelete").addEventListener("click", async () => {

    if (!pendingDelete || busy) return;

    const { resource, id } = pendingDelete;

    setBusy(true);

    $("confirmDelete").textContent = "DELETING...";

    try {

        const response = await apiRequest(

            `/${resource}/${encodeURIComponent(id)}`,

            {
                method: "DELETE"
            }

        );

        $("confirmDialog").close();

        pendingDelete = null;

        showToast(

            response.message ||

            "Record deleted successfully.",

            "success"

        );

        await refreshData({
            skeleton: false
        });

    } catch (error) {

        $("confirmDialog").close();

        pendingDelete = null;

        showToast(

            error.message,

            error.status === 409
                ? "warning"
                : "error"

        );

    } finally {

        setBusy(false);

        $("confirmDelete").textContent = "CONFIRM DELETE";

    }

});


$("cancelDelete").addEventListener("click", () => {

    if (busy) return;

    pendingDelete = null;

    $("confirmDialog").close();

});


/* =====================================================
   27. CSV EXPORT
===================================================== */

function csvCell(value) {

    let text = String(value ?? "");

    /*
       Prevent spreadsheet formula injection when
       user-entered text is opened in Excel.
    */

    if (/^[\s]*[=+\-@]/.test(text) ||
        /^[\t\r\n]/.test(text)) {

        text = "'" + text;

    }

    return `"${text.replace(/"/g, '""')}"`;

}


function exportCSV() {

    if (currentPage === "dashboard") return;

    const records = getFilteredRecords();

    if (!records.length) {

        showToast(
            "There are no records available to export.",
            "warning"
        );

        return;

    }

    const fields = CONFIG[currentPage].fields;

    const headers = fields

        .map(field => csvCell(field.label))

        .join(",");

    const rows = records.map(record =>

        fields.map(field =>

            csvCell(

                field.type === "reference"

                    ? referenceLabel(
                        field.collection,
                        record[field.name]
                    )

                    : record[field.name]

            )

        ).join(",")

    );

    const csv = "\uFEFF" +

        [headers, ...rows].join("\r\n");

    const blob = new Blob(

        [csv],

        {
            type: "text/csv;charset=utf-8;"
        }

    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = `ROTC_${currentPage}_${today()}.csv`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast(

        `${records.length} records prepared for CSV export.`,

        "success"

    );

}


/* =====================================================
   28. PRINT REPORT
===================================================== */

function printReport() {

    if (currentPage !== "dashboard" &&
        !getFilteredRecords().length) {

        showToast(

            "No records are available to print.",

            "warning"

        );

        return;

    }

    window.print();

}


/* =====================================================
   29. DARK / LIGHT MODE
===================================================== */

function applyTheme(theme) {

    const light = theme === "light";

    document.body.classList.toggle(
        "light-mode",
        light
    );

    $("themeIcon").setAttribute(

        "href",

        light ? "#i-moon" : "#i-sun"

    );

    $("themeButton").setAttribute(

        "aria-label",

        light
            ? "Switch to dark tactical mode"
            : "Switch to light tactical mode"

    );

    try {

        localStorage.setItem(
            "rotc-theme",
            light ? "light" : "dark"
        );

    } catch (error) {

        // Theme remains available for this session.

    }

}


$("themeButton").addEventListener("click", () => {

    const light = document.body.classList.contains(
        "light-mode"
    );

    applyTheme(light ? "dark" : "light");

});


/* =====================================================
   30. COMMAND CLOCK
===================================================== */

function updateClock() {

    const now = new Date();

    $("clock").textContent = now.toLocaleTimeString(

        "en-GB",

        {
            timeZone: "Asia/Manila",
            hour12: false
        }

    );

    $("clockDate").textContent = now.toLocaleDateString(

        "en-PH",

        {
            timeZone: "Asia/Manila",
            month: "short",
            day: "numeric",
            year: "numeric"
        }

    );

}


/* =====================================================
   31. RESPONSIVE MOBILE NAVIGATION
===================================================== */

function closeMobileMenu() {

    $("sidebar").classList.remove("open");

    $("mobileOverlay").classList.remove("show");

    $("menuButton").setAttribute(
        "aria-expanded",
        "false"
    );

}


$("menuButton").addEventListener("click", () => {

    const open = $("sidebar").classList.toggle("open");

    $("mobileOverlay").classList.toggle("show", open);

    $("menuButton").setAttribute(
        "aria-expanded",
        String(open)
    );

});


$("mobileOverlay").addEventListener(
    "click",
    closeMobileMenu
);


/* =====================================================
   32. BUTTON RIPPLE EFFECT
===================================================== */

document.addEventListener("pointerdown", event => {

    const button = event.target.closest(

        ".btn, .nav-button, .icon-button"

    );

    if (!button || button.disabled) return;

    if (

        window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches

    ) return;

    const rect = button.getBoundingClientRect();

    const ripple = document.createElement("span");

    ripple.className = "ripple";

    ripple.style.left = `${event.clientX - rect.left}px`;

    ripple.style.top = `${event.clientY - rect.top}px`;

    button.appendChild(ripple);

    setTimeout(() => ripple.remove(), 550);

});


/* =====================================================
   33. CENTRAL EVENT HANDLER
===================================================== */

document.addEventListener("click", event => {

    const navigation = event.target.closest("[data-page]");

    if (navigation) {

        navigate(navigation.dataset.page);

        return;

    }

    const viewButton = event.target.closest("[data-view]");

    if (viewButton && !busy && !loading) {

        currentView = viewButton.dataset.view;

        document.querySelectorAll("[data-view]")

            .forEach(button => {

                const active =
                    button.dataset.view === currentView;

                button.classList.toggle("active", active);

                button.setAttribute(
                    "aria-pressed",
                    String(active)
                );

            });

        renderRecords();

        return;

    }

    const paginationButton = event.target.closest(
        "[data-pagination]"
    );

    if (paginationButton && !paginationButton.disabled) {

        pageNumber = Number(
            paginationButton.dataset.pagination
        );

        renderRecords();

        return;

    }

    const button = event.target.closest("[data-action]");

    if (!button || busy || loading) return;

    const action = button.dataset.action;

    const id = button.dataset.id;

    if (action === "retry") {

        refreshData();

        return;

    }

    if (currentPage === "dashboard") return;

    switch (action) {

        case "add":

            openForm(currentPage);

            break;

        case "view":

            openDetails(currentPage, id);

            break;

        case "edit":

            openEdit(currentPage, id);

            break;

        case "delete":

            openDelete(currentPage, id);

            break;

        case "export":

            exportCSV();

            break;

        case "print":

            printReport();

            break;

        case "clear-filters":

            searchQuery = "";
            filterValue = "";
            platoonFilter = "";
            pageNumber = 1;

            renderModule(currentPage);

            break;

    }

});


/* =====================================================
   34. DIALOG AND REFRESH EVENTS
===================================================== */

$("closeDialog").addEventListener(
    "click",
    closeRecordDialog
);

$("cancelForm").addEventListener(
    "click",
    closeRecordDialog
);

$("recordDialog").addEventListener("cancel", event => {

    event.preventDefault();

    closeRecordDialog();

});

$("confirmDialog").addEventListener("cancel", event => {

    event.preventDefault();

    if (!busy) {

        pendingDelete = null;

        $("confirmDialog").close();

    }

});


$("refreshButton").addEventListener("click", async () => {

    if (busy || loading) return;

    await refreshData({

        skeleton: true,

        notify: true

    });

});


/* =====================================================
   35. INITIALIZE APPLICATION
===================================================== */

async function initialize() {

    try {

        const theme = localStorage.getItem("rotc-theme");

        applyTheme(theme === "light" ? "light" : "dark");

    } catch (error) {

        applyTheme("dark");

    }

    updateClock();

    setInterval(updateClock, 1000);

    renderNavigation();

    renderSkeleton();

    /*
       Startup animation represents interface initialization,
       not a successful database connection.
    */

    setTimeout(() => {

        $("startup").classList.add("finished");

    }, 1150);

    /*
       All five collections are retrieved from the existing
       Flask API. No fictional records are inserted.
    */

    await refreshData({
        skeleton: true
    });

}


initialize();

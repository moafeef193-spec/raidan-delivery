// ============================================================
// 🛵 RAidan Al Mandi - Delivery Management System
// النسخة المصححة
// ============================================================

const CONFIG = {
    SUPABASE_URL: "https://fkhwohfmwbvztwgarngj.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_QGcSfYZLF1z_VY4mbpHOJQ_8_F-qaP5"
};

let sb = null;
let drivers = [];
let orders = [];

// ------------------------------------------------------------
// أسماء الدلفري الافتراضية
// ------------------------------------------------------------

const DEFAULT_DRIVERS = [
    "شاهد",
    "نعيم",
    "ارشد",
    "صمد",
    "منور علي",
    "شهزاد",
    "Anam",
    "Naeem UD",
    "اديب"
];

// ------------------------------------------------------------
// تشغيل Supabase
// ------------------------------------------------------------

function supabaseReady() {
    return (
        typeof supabase !== "undefined" &&
        CONFIG.SUPABASE_URL &&
        CONFIG.SUPABASE_ANON_KEY &&
        !CONFIG.SUPABASE_URL.includes("ضع_") &&
        !CONFIG.SUPABASE_ANON_KEY.includes("ضع_")
    );
}

async function init() {

    if (supabaseReady()) {

        sb = supabase.createClient(
            CONFIG.SUPABASE_URL,
            CONFIG.SUPABASE_ANON_KEY
        );

        await loadData();

        subscribeRealtime();

    } else {

        // وضع تجريبي إذا لم يتم ربط Supabase
        drivers = DEFAULT_DRIVERS.map((name, index) => ({
            id: index + 1,
            name,
            status: "available",
            priority: index + 1
        }));

        orders = [];

        renderAll();
    }

    updateClock();
    setInterval(updateClock, 1000);
}

// ------------------------------------------------------------
// تحميل البيانات
// ------------------------------------------------------------

async function loadData() {

    if (!sb) return;

    const driversResult = await sb
        .from("drivers")
        .select("*")
        .order("priority", { ascending: true });

    const ordersResult = await sb
        .from("delivery_orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (driversResult.error) {
        console.error("Drivers error:", driversResult.error);
    } else {
        drivers = driversResult.data || [];
    }

    if (ordersResult.error) {
        console.error("Orders error:", ordersResult.error);
    } else {
        orders = ordersResult.data || [];
    }

    renderAll();
}

// ------------------------------------------------------------
// تحديث مباشر بين الآيباد واللابتوب
// ------------------------------------------------------------

function subscribeRealtime() {

    if (!sb) return;

    sb.channel("raidan-delivery-live")

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "drivers"
            },
            async () => {
                await loadData();
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "delivery_orders"
            },
            async () => {
                await loadData();
            }
        )

        .subscribe();
}

// ------------------------------------------------------------
// الوقت
// ------------------------------------------------------------

function updateClock() {

    const element = document.getElementById("dateTime");

    if (!element) return;

    element.textContent =
        new Date().toLocaleString("ar-AE", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
}

// ------------------------------------------------------------
// الحصول على الطلبات النشطة للدلفري
// ------------------------------------------------------------

function activeOrdersForDriver(driverId) {

    return orders.filter(order =>
        String(order.driver_id) === String(driverId) &&
        order.status === "out"
    );
}

// ------------------------------------------------------------
// الدلفري الأول في الدور
// ------------------------------------------------------------

function getFirstAvailableDriver() {

    return drivers
        .filter(driver => {

            const active = activeOrdersForDriver(driver.id);

            return (
                driver.status === "available" &&
                active.length === 0
            );

        })
        .sort((a, b) =>
            Number(a.priority || 999999) -
            Number(b.priority || 999999)
        )[0];
}

// ------------------------------------------------------------
// بدء توصيل طلب
// ------------------------------------------------------------

async function startDelivery(driverId) {

    const driver = drivers.find(
        d => String(d.id) === String(driverId)
    );

    if (!driver) return;

    const input = document.querySelector(
        `#driver-${driverId} input`
    );

    const orderNumber = input
        ? input.value.trim()
        : "";

    if (!orderNumber) {

        alert("⚠️ يجب إدخال رقم الطلب أولاً.");

        return;
    }

    // التأكد من أن الدلفري لا يأخذ الطلب مرتين
    const duplicate = orders.some(order =>
        String(order.order_number) === String(orderNumber) &&
        order.status === "out"
    );

    if (duplicate) {

        alert("⚠️ رقم الطلب هذا موجود حالياً في طلبات التوصيل.");

        return;
    }

    // --------------------------------------------------------
    // التحقق من الدور
    // --------------------------------------------------------

    const firstDriver = getFirstAvailableDriver();

    if (
        firstDriver &&
        String(firstDriver.id) !== String(driver.id)
    ) {

        const confirmTurn = confirm(
            `الدور الحالي للدلفري: ${firstDriver.name}\n\n` +
            `هل تريد السماح لـ ${driver.name} بالخروج؟`
        );

        if (!confirmTurn) return;
    }

    const departureTime = new Date().toISOString();

    // --------------------------------------------------------
    // Supabase
    // --------------------------------------------------------

    if (sb) {

        const insertResult = await sb
            .from("delivery_orders")
            .insert({
                driver_id: driver.id,
                driver_name: driver.name,
                order_number: orderNumber,
                status: "out",
                departed_at: departureTime
            })
            .select()
            .single();

        if (insertResult.error) {

            console.error(insertResult.error);

            alert(
                "حدث خطأ أثناء حفظ الطلب:\n" +
                insertResult.error.message
            );

            return;
        }

        // يصبح خارج فقط إذا لم يكن خارجاً أصلاً
        await sb
            .from("drivers")
            .update({
                status: "out"
            })
            .eq("id", driver.id);

        // إزالة الدلفري من الدور
        await removeDriverFromPriority(driver.id);

    } else {

        orders.push({
            id: Date.now(),
            driver_id: driver.id,
            driver_name: driver.name,
            order_number: orderNumber,
            status: "out",
            departed_at: departureTime,
            returned_at: null,
            created_at: departureTime
        });

        driver.status = "out";

        removeDriverFromLocalPriority(driver.id);
    }

    if (input) input.value = "";

    await loadDataIfPossible();

    renderAll();
}

// ------------------------------------------------------------
// إزالة الدلفري من الدور عند خروجه
// ------------------------------------------------------------

async function removeDriverFromPriority(driverId) {

    if (!sb) return;

    const remaining = drivers
        .filter(d =>
            String(d.id) !== String(driverId)
        )
        .sort((a, b) =>
            Number(a.priority || 999999) -
            Number(b.priority || 999999)
        );

    for (let i = 0; i < remaining.length; i++) {

        await sb
            .from("drivers")
            .update({
                priority: i + 1
            })
            .eq("id", remaining[i].id);
    }
}

// ------------------------------------------------------------
// النسخة المحلية من إزالة الدور
// ------------------------------------------------------------

function removeDriverFromLocalPriority(driverId) {

    const remaining = drivers
        .filter(d =>
            String(d.id) !== String(driverId)
        )
        .sort((a, b) =>
            Number(a.priority || 999999) -
            Number(b.priority || 999999)
        );

    remaining.forEach((driver, index) => {

        driver.priority = index + 1;

    });

    const driver = drivers.find(
        d => String(d.id) === String(driverId)
    );

    if (driver) {
        driver.status = "out";
        driver.priority = 999999;
    }
}

// ------------------------------------------------------------
// تسجيل رجوع الطلب
// ------------------------------------------------------------

async function returnOrder(orderId) {

    const order = orders.find(
        o => String(o.id) === String(orderId)
    );

    if (!order) return;

    const returnTime = new Date().toISOString();

    // تحديث الطلب
    if (sb) {

        const result = await sb
            .from("delivery_orders")
            .update({
                status: "returned",
                returned_at: returnTime
            })
            .eq("id", order.id);

        if (result.error) {

            alert(
                "حدث خطأ أثناء تسجيل الرجوع:\n" +
                result.error.message
            );

            return;
        }

        // هل مازال عند الدلفري طلبات خارجية؟
        const activeRemaining = orders.filter(o =>
            String(o.driver_id) === String(order.driver_id) &&
            o.status === "out" &&
            String(o.id) !== String(order.id)
        );

        // إذا لا يوجد طلب آخر، يصبح متاحاً فوراً
        if (activeRemaining.length === 0) {

            await sb
                .from("drivers")
                .update({
                    status: "available"
                })
                .eq("id", order.driver_id);

            // يدخل آخر الدور
            await putDriverAtEndOfPriority(
                order.driver_id
            );
        }

    } else {

        order.status = "returned";
        order.returned_at = returnTime;

        const driver = drivers.find(
            d => String(d.id) === String(order.driver_id)
        );

        const remaining = activeOrdersForDriver(
            order.driver_id
        ).filter(
            o => String(o.id) !== String(order.id)
        );

        if (remaining.length === 0 && driver) {

            driver.status = "available";

            putDriverAtEndOfLocalPriority(
                driver.id
            );
        }
    }

    await loadDataIfPossible();

    renderAll();
}

// ------------------------------------------------------------
// وضع الدلفري في آخر الدور
// ------------------------------------------------------------

async function putDriverAtEndOfPriority(driverId) {

    if (!sb) return;

    const list = drivers
        .filter(d =>
            String(d.id) !== String(driverId)
        )
        .sort((a, b) =>
            Number(a.priority || 999999) -
            Number(b.priority || 999999)
        );

    const driver = drivers.find(
        d => String(d.id) === String(driverId)
    );

    if (!driver) return;

    // ترتيب المتاحين أولاً
    const available = list.filter(
        d => d.status === "available"
    );

    const busy = list.filter(
        d => d.status !== "available"
    );

    for (let i = 0; i < available.length; i++) {

        await sb
            .from("drivers")
            .update({
                priority: i + 1
            })
            .eq("id", available[i].id);
    }

    await sb
        .from("drivers")
        .update({
            priority: available.length + 1,
            status: "available"
        })
        .eq("id", driver.id);

    // إبقاء الخارجين بعد ذلك
    for (let i = 0; i < busy.length; i++) {

        await sb
            .from("drivers")
            .update({
                priority: available.length + 2 + i
            })
            .eq("id", busy[i].id);
    }

    await loadData();
}

// ------------------------------------------------------------
// النسخة المحلية
// ------------------------------------------------------------

function putDriverAtEndOfLocalPriority(driverId) {

    const available = drivers
        .filter(d =>
            d.status === "available" &&
            String(d.id) !== String(driverId)
        )
        .sort((a, b) =>
            Number(a.priority || 999999) -
            Number(b.priority || 999999)
        );

    const driver = drivers.find(
        d => String(d.id) === String(driverId)
    );

    if (!driver) return;

    available.forEach((d, index) => {

        d.priority = index + 1;

    });

    driver.priority = available.length + 1;
    driver.status = "available";
}

// ------------------------------------------------------------
// تحميل البيانات إذا كانت Supabase موجودة
// ------------------------------------------------------------

async function loadDataIfPossible() {

    if (sb) {

        await loadData();

    }
}

// ------------------------------------------------------------
// إضافة دلفري
// ------------------------------------------------------------

async function addDriver() {

    const input = document.getElementById("newDriver");

    if (!input) return;

    const name = input.value.trim();

    if (!name) {

        alert("اكتب اسم الدلفري.");

        return;
    }

    const nextPriority =
        drivers.filter(d => d.status === "available").length + 1;

    if (sb) {

        const result = await sb
            .from("drivers")
            .insert({
                name,
                status: "available",
                priority: nextPriority
            });

        if (result.error) {

            alert(result.error.message);

            return;
        }

        await loadData();

    } else {

        drivers.push({
            id: Date.now(),
            name,
            status: "available",
            priority: nextPriority
        });

        renderAll();
    }

    input.value = "";
}

// ------------------------------------------------------------
// حذف دلفري
// ------------------------------------------------------------

async function deleteDriver(driverId) {

    const driver = drivers.find(
        d => String(d.id) === String(driverId)
    );

    if (!driver) return;

    const confirmDelete = confirm(
        `هل تريد حذف الدلفري ${driver.name}؟`
    );

    if (!confirmDelete) return;

    if (sb) {

        const result = await sb
            .from("drivers")
            .delete()
            .eq("id", driver.id);

        if (result.error) {

            alert(result.error.message);

            return;
        }

        await loadData();

    } else {

        drivers = drivers.filter(
            d => String(d.id) !== String(driverId)
        );

        renderAll();
    }
}

// ------------------------------------------------------------
// تنسيق الوقت
// ------------------------------------------------------------

function formatTime(value) {

    if (!value) return "—";

    return new Date(value).toLocaleTimeString(
        "ar-AE",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}

// ------------------------------------------------------------
// تنسيق التاريخ
// ------------------------------------------------------------

function formatDate(value) {

    if (!value) return "—";

    return new Date(value).toLocaleDateString(
        "ar-AE",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    );
}

// ------------------------------------------------------------
// حماية النصوص
// ------------------------------------------------------------

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ------------------------------------------------------------
// رسم كل الواجهات
// ------------------------------------------------------------

function renderAll() {

    renderDrivers();

    renderPriority();

    renderActiveOrders();

    renderStats();

    renderAdmin();

}

// ------------------------------------------------------------
// بطاقات الدلفري
// ------------------------------------------------------------

function renderDrivers() {

    const container =
        document.getElementById("drivers");

    if (!container) return;

    container.innerHTML =
        drivers
            .sort((a, b) =>
                Number(a.priority || 999999) -
                Number(b.priority || 999999)
            )
            .map(driver => {

                const active =
                    activeOrdersForDriver(driver.id);

                const isAvailable =
                    active.length === 0;

                const orderNumbers =
                    active.map(
                        o => "#" + escapeHTML(o.order_number)
                    ).join(" ، ");

                return `
                <div class="driver">

                    <h3>
                        ${escapeHTML(driver.name)}
                    </h3>

                    <div class="status ${
                        isAvailable
                            ? "available"
                            : "busy"
                    }">

                        ${
                            isAvailable
                                ? "🟢 متاح"
                                : "🔴 خارج للتوصيل"
                        }

                        · ${active.length} طلب

                    </div>

                    ${
                        active.length
                            ? `
                            <div style="margin-bottom:10px">
                                الطلبات الحالية:
                                <b>${orderNumbers}</b>
                            </div>
                            `
                            : ""
                    }

                    ${
                        isAvailable
                            ? `
                            <div id="driver-${driver.id}">

                                <input
                                    type="text"
                                    inputmode="numeric"
                                    placeholder="رقم الطلب"
                                >

                                <button
                                    class="gold"
                                    onclick="startDelivery('${driver.id}')"
                                >
                                    🛵 بدء التوصيل
                                </button>

                            </div>
                            `
                            : `
                            <div style="
                                padding:10px;
                                border-top:1px solid #64451d;
                                margin-top:10px;
                            ">
                                يمكن للدلفري أخذ طلب إضافي
                            </div>

                            <div id="driver-${driver.id}">

                                <input
                                    type="text"
                                    inputmode="numeric"
                                    placeholder="رقم طلب إضافي"
                                >

                                <button
                                    class="gold"
                                    onclick="startDelivery('${driver.id}')"
                                >
                                    ➕ إضافة طلب
                                </button>

                            </div>
                            `
                    }

                </div>
                `;

            })
            .join("");
}

// ------------------------------------------------------------
// عرض الدور
// ------------------------------------------------------------

function renderPriority() {

    const container =
        document.getElementById("priority");

    if (!container) return;

    const available =
        drivers
            .filter(driver =>
                driver.status === "available" &&
                activeOrdersForDriver(driver.id).length === 0
            )
            .sort((a, b) =>
                Number(a.priority || 999999) -
                Number(b.priority || 999999)
            );

    if (!available.length) {

        container.innerHTML =
            "<span>🔴 لا يوجد دلفري متاح حالياً</span>";

        return;
    }

    container.innerHTML =
        available.map((driver, index) => `
            <span>
                ${index + 1}️⃣
                ${escapeHTML(driver.name)}
            </span>
        `).join("");
}

// ------------------------------------------------------------
// الطلبات الجاري توصيلها
// ------------------------------------------------------------

function renderActiveOrders() {

    const container =
        document.getElementById("activeOrders");

    if (!container) return;

    const active =
        orders.filter(
            order => order.status === "out"
        );

    if (!active.length) {

        container.innerHTML =
            "<div>لا توجد طلبات جاري توصيلها.</div>";

        return;
    }

    container.innerHTML =
        active.map(order => `

            <div class="order">

                <b>
                    ${escapeHTML(order.driver_name)}
                </b>

                <br>

                رقم الطلب:
                <strong>
                    #${escapeHTML(order.order_number)}
                </strong>

                <br>

                وقت الخروج:
                ${formatTime(order.departed_at)}

                <br><br>

                <button
                    onclick="returnOrder('${order.id}')"
                >
                    🔙 تسجيل الرجوع
                </button>

            </div>

        `).join("");
}

// ------------------------------------------------------------
// الإحصائيات
// ------------------------------------------------------------

function renderStats() {

    const available =
        drivers.filter(driver =>
            driver.status === "available" &&
            activeOrdersForDriver(driver.id).length === 0
        ).length;

    const out =
        drivers.filter(driver =>
            activeOrdersForDriver(driver.id).length > 0
        ).length;

    const activeOrders =
        orders.filter(
            order => order.status === "out"
        ).length;

    const a =
        document.getElementById("availableCount");

    const o =
        document.getElementById("outCount");

    const c =
        document.getElementById("ordersCount");

    if (a) a.textContent = available;

    if (o) o.textContent = out;

    if (c) c.textContent = activeOrders;
}

// ------------------------------------------------------------
// لوحة التحكم
// ------------------------------------------------------------

function renderAdmin() {

    const driverContainer =
        document.getElementById("adminDrivers");

    if (driverContainer) {

        driverContainer.innerHTML =
            drivers
                .sort((a, b) =>
                    Number(a.priority || 999999) -
                    Number(b.priority || 999999)
                )
                .map((driver, index) => {

                    const active =
                        activeOrdersForDriver(driver.id);

                    return `
                    <div style="
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                        gap:10px;
                        padding:12px;
                        border-bottom:1px solid #533d1c;
                    ">

                        <div>
                            <b>
                                ${index + 1}.
                                ${escapeHTML(driver.name)}
                            </b>

                            <br>

                            ${
                                active.length
                                    ? "🔴 خارج"
                                    : "🟢 متاح"
                            }

                        </div>

                        <button
                            onclick="deleteDriver('${driver.id}')"
                        >
                            حذف
                        </button>

                    </div>
                    `;

                })
                .join("");
    }

    renderHistory();

}

// ------------------------------------------------------------
// سجل جميع الطلبات - لا يتم حذف الطلب بعد الرجوع
// ------------------------------------------------------------

function renderHistory() {

    const table =
        document.getElementById("history");

    if (!table) return;

    const allOrders =
        [...orders].sort((a, b) =>
            new Date(b.created_at || b.departed_at) -
            new Date(a.created_at || a.departed_at)
        );

    if (!allOrders.length) {

        table.innerHTML = `
            <tr>
                <td colspan="5">
                    لا توجد طلبات مسجلة اليوم
                </td>
            </tr>
        `;

        return;
    }

    table.innerHTML =
        allOrders.map(order => `

            <tr>

                <td>
                    ${escapeHTML(order.driver_name)}
                </td>

                <td>
                    #${escapeHTML(order.order_number)}
                </td>

                <td>
                    ${formatTime(order.departed_at)}
                </td>

                <td>
                    ${formatTime(order.returned_at)}
                </td>

                <td>
                    ${
                        order.status === "out"
                            ? "🔴 جاري التوصيل"
                            : "🟢 تم الرجوع"
                    }
                </td>

            </tr>

        `).join("");
}

// ------------------------------------------------------------
// إنهاء الدوام
// ------------------------------------------------------------

function endShift() {

    window.location.href =
        "admin.html?print=1";
}

// ------------------------------------------------------------
// تشغيل تلقائي عند فتح الصفحة
// ------------------------------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await init();

        // إذا كانت لوحة الإدارة
        if (
            window.location.pathname.includes(
                "admin.html"
            )
        ) {

            renderAdmin();

            const params =
                new URLSearchParams(
                    window.location.search
                );

            if (
                params.get("print") === "1"
            ) {

                setTimeout(() => {

                    window.print();

                }, 1500);
            }
        }

    }
);

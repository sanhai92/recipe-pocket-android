const STORAGE_KEY = "recipe-pocket-data-v1";
const APP_VERSION = "1.0.13";
const APP_VERSION_NOTES = "Imports Recipe Manager collection zip files";
const RM1_BEGIN = "RM1-BEGIN:";
const RM1_END = ":RM1-END";
const RM1_LEGACY_PREFIX = "RM1:";
const MAX_RM1_CODE_LENGTH = 100000;
const MAX_RM1_DECODED_BYTES = 1000000;
const MAX_COLLECTION_IMPORT_BYTES = 5_000_000;
const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_MS = 24 * 60 * 60 * 1000;

const sampleRecipes = [
  {
    id: crypto.randomUUID(),
    title: "Tomato Lentil Pasta",
    cuisine: "Italian",
    minutes: 28,
    servings: 4,
    favorite: true,
    tags: ["vegan", "weeknight"],
    ingredients: [
      { quantity: 300, unit: "g", name: "pasta" },
      { quantity: 1, unit: "cup", name: "red lentils" },
      { quantity: 2, unit: "cups", name: "tomato sauce" },
      { quantity: 1, unit: "", name: "onion" },
      { quantity: 2, unit: "cloves", name: "garlic" }
    ],
    tools: ["Pot", "Pan"],
    instructions: "Cook pasta. Simmer onion, garlic, lentils, and tomato sauce until tender. Toss together and season.",
    source: "",
    image: ""
  },
  {
    id: crypto.randomUUID(),
    title: "Chickpea Rice Bowl",
    cuisine: "Mediterranean",
    minutes: 22,
    servings: 2,
    favorite: false,
    tags: ["lunch", "quick"],
    ingredients: [
      { quantity: 1, unit: "can", name: "chickpeas" },
      { quantity: 1, unit: "cup", name: "rice" },
      { quantity: 1, unit: "", name: "cucumber" },
      { quantity: 8, unit: "", name: "cherry tomatoes" },
      { quantity: 2, unit: "tbsp", name: "tahini" }
    ],
    tools: ["Pan", "Bowl"],
    instructions: "Warm chickpeas with spices. Serve over rice with cucumber, tomatoes, and tahini sauce.",
    source: "",
    image: ""
  },
  {
    id: crypto.randomUUID(),
    title: "Golden Potato Soup",
    cuisine: "Dutch",
    minutes: 35,
    servings: 4,
    favorite: false,
    tags: ["winter", "one pot"],
    ingredients: [
      { quantity: 5, unit: "", name: "potatoes" },
      { quantity: 2, unit: "", name: "carrots" },
      { quantity: 1, unit: "", name: "leek" },
      { quantity: 750, unit: "ml", name: "vegetable stock" },
      { quantity: 1, unit: "tsp", name: "mustard" }
    ],
    tools: ["Soup pot", "Blender"],
    instructions: "Simmer vegetables in stock until soft. Blend partly, stir in mustard, and season.",
    source: "",
    image: ""
  }
];

let state = loadState();
let activeTag = "";
let favoritesOnly = false;
let currentDetailId = "";
let detailServings = 1;
let recipeEditorInitialSnapshot = "";
let expandedMealDay = "";

const $ = (id) => document.getElementById(id);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        recipes: Array.isArray(parsed.recipes) ? parsed.recipes : sampleRecipes,
        pantry: Array.isArray(parsed.pantry) ? parsed.pantry : [],
        checkedShopping: Array.isArray(parsed.checkedShopping) ? parsed.checkedShopping : [],
        mealPlan: normalizeMealPlan(parsed.mealPlan),
        settings: normalizeSettings(parsed.settings)
      };
    } catch {
      return { recipes: sampleRecipes, pantry: [], checkedShopping: [], mealPlan: createEmptyMealPlan(), settings: createDefaultSettings() };
    }
  }
  return { recipes: sampleRecipes, pantry: [], checkedShopping: [], mealPlan: createEmptyMealPlan(), settings: createDefaultSettings() };
}

function createDefaultSettings() {
  return { defaultMealServings: 2, backupReminderDays: 7, lastBackupAt: "", shoppingSort: "recipe" };
}

function normalizeSettings(settings) {
  return {
    defaultMealServings: clampServings(settings?.defaultMealServings ?? 2),
    backupReminderDays: clampBackupDays(settings?.backupReminderDays ?? 7),
    lastBackupAt: typeof settings?.lastBackupAt === "string" ? settings.lastBackupAt : "",
    shoppingSort: settings?.shoppingSort === "category" ? "category" : "recipe"
  };
}

function clampServings(value) {
  return Math.min(99, Math.max(1, Number(value) || 1));
}

function clampBackupDays(value) {
  return Math.min(365, Math.max(1, Number(value) || 7));
}

function createEmptyMealPlan() {
  return Object.fromEntries(DAYS_OF_WEEK.map((day) => [day, { recipeId: "", servings: 1 }]));
}

function normalizeMealPlan(plan) {
  const normalized = createEmptyMealPlan();
  if (!plan || typeof plan !== "object") return normalized;
  DAYS_OF_WEEK.forEach((day) => {
    const entry = plan[day];
    if (!entry || typeof entry !== "object") return;
    normalized[day] = {
      recipeId: String(entry.recipeId || ""),
      servings: Math.max(1, Number(entry.servings) || 1)
    };
  });
  return normalized;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function formatMeta(recipe) {
  const parts = [];
  if (recipe.cuisine) parts.push(recipe.cuisine);
  if (recipe.minutes) parts.push(`${recipe.minutes} min`);
  parts.push(`${recipe.servings || 1} servings`);
  return parts.join(" - ");
}

function parseIngredients(text) {
  return text.split(/\n+/).map((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)?\s*([a-zA-Z]+)?\s*(.*)$/);
    if (!match) return { quantity: null, unit: "", name: trimmed };
    const quantity = match[1] ? parseQuantity(match[1]) : null;
    const unit = match[2] && match[3] ? match[2] : "";
    const name = match[3] || (match[2] && !match[3] ? match[2] : trimmed);
    return { quantity, unit, name: name.trim() };
  }).filter((item) => item.name);
}

function parseQuantity(value) {
  if (value.includes("/")) {
    const [top, bottom] = value.split("/").map(Number);
    return bottom ? top / bottom : null;
  }
  return Number(value.replace(",", "."));
}

function formatIngredient(item, multiplier = 1) {
  const amount = item.quantity ? Number((item.quantity * multiplier).toFixed(2)).toString() : "";
  return [amount, item.unit, item.name].filter(Boolean).join(" ");
}

function renderAll() {
  renderVersion();
  renderSettings();
  renderBackupReminder();
  renderTags();
  renderRecipes();
  renderPantry();
  renderMealPlan();
}

function renderVersion() {
  $("appVersionLabel").textContent = `v${APP_VERSION}`;
  $("appVersionNotes").textContent = APP_VERSION_NOTES;
}

function renderSettings() {
  $("defaultMealServingsInput").value = state.settings.defaultMealServings;
  $("backupReminderDaysInput").value = state.settings.backupReminderDays;
  $("defaultShoppingSortSelect").value = state.settings.shoppingSort;
  $("backupStatusText").textContent = state.settings.lastBackupAt
    ? `Last backup: ${new Date(state.settings.lastBackupAt).toLocaleDateString()}`
    : "No backup saved yet";
}

function renderBackupReminder() {
  const shouldShow = isBackupDue();
  $("backupBanner").classList.toggle("hidden", !shouldShow);
}

function isBackupDue() {
  if (!state.recipes.length) return false;
  if (!state.settings.lastBackupAt) return true;
  const lastBackup = Date.parse(state.settings.lastBackupAt);
  if (!Number.isFinite(lastBackup)) return true;
  return Date.now() - lastBackup >= state.settings.backupReminderDays * DAY_MS;
}

function renderTags() {
  const tags = [...new Set(state.recipes.flatMap((recipe) => recipe.tags || []))].sort();
  $("tagFilters").innerHTML = "";
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.className = `chip ${activeTag === tag ? "active" : ""}`;
    button.textContent = `#${tag}`;
    button.addEventListener("click", () => {
      activeTag = activeTag === tag ? "" : tag;
      renderAll();
    });
    $("tagFilters").append(button);
  });
}

function recipeMatches(recipe, query) {
  const haystack = [
    recipe.title,
    recipe.cuisine,
    recipe.instructions,
    ...(recipe.tags || []),
    ...(recipe.ingredients || []).map((item) => item.name)
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function filteredRecipes() {
  const query = normalize($("recipeSearch").value);
  return state.recipes.filter((recipe) => {
    if (favoritesOnly && !recipe.favorite) return false;
    if (activeTag && !(recipe.tags || []).includes(activeTag)) return false;
    return !query || recipeMatches(recipe, query);
  });
}

function renderRecipes() {
  const list = $("recipeList");
  list.innerHTML = "";
  const recipes = filteredRecipes();
  if (!recipes.length) {
    list.innerHTML = `<p class="empty">No recipes found.</p>`;
    return;
  }
  recipes.forEach((recipe) => list.append(createRecipeCard(recipe)));
}

function createRecipeCard(recipe) {
  const node = $("recipeCardTemplate").content.firstElementChild.cloneNode(true);
  node.querySelector("strong").textContent = recipe.title;
  node.querySelector("small").textContent = formatMeta(recipe);
  node.querySelector(".mini-tags").textContent = (recipe.tags || []).map((tag) => `#${tag}`).join(" ");
  node.querySelector(".favorite-mark").textContent = recipe.favorite ? "*" : "";
  node.addEventListener("click", () => openDetail(recipe.id));
  return node;
}

function renderPantry() {
  const chips = $("pantryChips");
  chips.innerHTML = "";
  state.pantry.forEach((item) => {
    const button = document.createElement("button");
    button.className = "chip active";
    button.textContent = `${item} x`;
    button.addEventListener("click", () => {
      state.pantry = state.pantry.filter((x) => x !== item);
      saveState();
      renderAll();
    });
    chips.append(button);
  });

  const pantrySet = new Set(state.pantry.map(normalize));
  const matches = state.recipes.filter((recipe) =>
    (recipe.ingredients || []).every((item) => pantrySet.has(normalize(item.name)))
  );
  const list = $("pantryMatches");
  list.innerHTML = "";
  matches.forEach((recipe) => list.append(createRecipeCard(recipe)));
  if (!matches.length) list.innerHTML = `<p class="empty">Add pantry ingredients to find matches.</p>`;
}

function renderMealPlan() {
  const list = $("mealPlanList");
  list.innerHTML = "";
  DAYS_OF_WEEK.forEach((day) => {
    const entry = state.mealPlan[day] || { recipeId: "", servings: 1 };
    const recipe = state.recipes.find((item) => item.id === entry.recipeId);
    const node = $("mealPlanDayTemplate").content.firstElementChild.cloneNode(true);
    node.dataset.day = day;
    const isExpanded = expandedMealDay === day;
    node.classList.toggle("expanded", isExpanded);
    node.querySelector(".meal-day-name").textContent = day;
    node.querySelector(".meal-day-summary").textContent = recipe ? recipe.title : "No meal planned";
    const mealBody = node.querySelector(".meal-day-body");
    mealBody.hidden = !isExpanded;
    node.querySelector(".meal-toggle-button").setAttribute("aria-expanded", String(isExpanded));

    node.querySelector(".meal-day-head").addEventListener("click", (event) => {
      if (event.target.closest(".meal-clear-button")) return;
      const selectedDay = event.currentTarget.closest(".meal-day").dataset.day;
      expandedMealDay = expandedMealDay === selectedDay ? "" : selectedDay;
      renderMealPlan();
    });

    const select = node.querySelector(".meal-recipe-select");
    addRecipeOptions(select, entry.recipeId);
    select.addEventListener("change", () => {
      state.mealPlan[day].recipeId = select.value;
      if (select.value && !state.mealPlan[day].servings) state.mealPlan[day].servings = state.settings.defaultMealServings;
      saveState();
      renderMealPlan();
    });

    const servings = node.querySelector(".meal-servings-input");
    servings.value = entry.servings || 1;
    servings.disabled = !entry.recipeId;
    servings.addEventListener("change", () => {
      state.mealPlan[day].servings = clampServings(servings.value);
      saveState();
      renderMealPlan();
    });

    node.querySelector(".meal-clear-button").addEventListener("click", () => {
      state.mealPlan[day] = { recipeId: "", servings: state.settings.defaultMealServings };
      if (expandedMealDay === day) expandedMealDay = "";
      saveState();
      renderMealPlan();
    });
    list.append(node);
  });
  renderMealShoppingList();
}

function renderMealShoppingList() {
  const list = $("mealShoppingList");
  $("shoppingSortSelect").value = state.settings.shoppingSort;
  list.innerHTML = "";
  const sections = getMealShoppingSections();
  sections.forEach((section) => {
    if (section.title) {
      const heading = document.createElement("h3");
      heading.className = "shopping-recipe-heading";
      heading.textContent = section.title;
      list.append(heading);
    }
    section.items.forEach((item) => list.append(createShoppingItem(item)));
  });
  if (!sections.some((section) => section.items.length)) list.innerHTML = `<p class="empty">No planned ingredients to shop for.</p>`;
}

function getUncheckedShoppingText() {
  const sections = getMealShoppingSections()
    .map((section) => ({
      title: section.title,
      items: section.items.filter((item) => !state.checkedShopping.includes(item.key))
    }))
    .filter((section) => section.items.length);
  return sections.flatMap((section) => [
    ...(section.title ? [section.title] : []),
    ...section.items.map((item) => `- ${item.text}`)
  ]).join("\n");
}

async function copyUncheckedShoppingList() {
  const text = getUncheckedShoppingText();
  if (!text) {
    showToast("Nothing to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("Shopping list copied");
  } catch {
    showToast("Copy failed");
  }
}

function showToast(message) {
  $("toastMessage").textContent = message;
  $("toastMessage").classList.remove("hidden");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => $("toastMessage").classList.add("hidden"), 2200);
}

function createShoppingItem(item) {
  const label = document.createElement("label");
  label.className = `shopping-item ${state.checkedShopping.includes(item.key) ? "done" : ""}`;
  label.innerHTML = `<input type="checkbox"><span></span>`;
  const checkbox = label.querySelector("input");
  checkbox.checked = state.checkedShopping.includes(item.key);
  label.querySelector("span").textContent = item.text;
  checkbox.addEventListener("change", () => {
    state.checkedShopping = checkbox.checked
      ? [...new Set([...state.checkedShopping, item.key])]
      : state.checkedShopping.filter((checked) => checked !== item.key);
    saveState();
    renderMealShoppingList();
  });
  return label;
}

function getMealShoppingSections() {
  return state.settings.shoppingSort === "category"
    ? getCategorySortedShoppingSections()
    : getRecipeSortedShoppingSections();
}

function getRecipeSortedShoppingSections() {
  const pantrySet = new Set(state.pantry.map(normalize));
  return DAYS_OF_WEEK.map((day) => {
    const entry = state.mealPlan[day];
    const recipe = state.recipes.find((item) => item.id === entry?.recipeId);
    if (!recipe) return null;
    const grouped = new Map();
    const multiplier = clampServings(entry.servings) / (recipe.servings || 1);
    recipe.ingredients.forEach((ingredient) => {
      if (pantrySet.has(normalize(ingredient.name))) return;
      const key = `${normalize(ingredient.unit)}::${normalize(ingredient.name)}`;
      const current = grouped.get(key) || { ...ingredient, quantity: 0, hasQuantity: true };
      if (ingredient.quantity) {
        current.quantity += ingredient.quantity * multiplier;
      } else {
        current.hasQuantity = false;
      }
      grouped.set(key, current);
    });
    const items = [...grouped.values()]
      .map((item) => createShoppingItemData(item, `${recipe.id}:${day}`))
      .sort((a, b) => a.text.localeCompare(b.text));
    return { title: recipe.title, items };
  }).filter(Boolean).filter((section) => section.items.length);
}

function getCategorySortedShoppingSections() {
  const pantrySet = new Set(state.pantry.map(normalize));
  const grouped = new Map();
  DAYS_OF_WEEK.forEach((day) => {
    const entry = state.mealPlan[day];
    const recipe = state.recipes.find((item) => item.id === entry?.recipeId);
    if (!recipe) return;
    const multiplier = clampServings(entry.servings) / (recipe.servings || 1);
    recipe.ingredients.forEach((ingredient) => {
      if (pantrySet.has(normalize(ingredient.name))) return;
      const key = `${normalize(ingredient.unit)}::${normalize(ingredient.name)}`;
      const current = grouped.get(key) || { ...ingredient, quantity: 0, hasQuantity: true };
      if (ingredient.quantity) {
        current.quantity += ingredient.quantity * multiplier;
      } else {
        current.hasQuantity = false;
      }
      grouped.set(key, current);
    });
  });
  const items = [...grouped.values()]
    .map((item) => createShoppingItemData(item, "category"))
    .sort((a, b) => a.category.localeCompare(b.category) || a.text.localeCompare(b.text));
  const sections = new Map();
  items.forEach((item) => {
    const title = formatShoppingCategory(item.category);
    const section = sections.get(title) || { title, items: [] };
    section.items.push(item);
    sections.set(title, section);
  });
  return [...sections.values()];
}

function createShoppingItemData(item, scope) {
  const text = item.hasQuantity ? formatIngredient(item) : [item.unit, item.name].filter(Boolean).join(" ");
  return {
    category: getIngredientCategory(item.name, item.category),
    key: `${scope}:${normalize(item.unit)}:${normalize(item.name)}`,
    text
  };
}

function getIngredientCategory(name, importedCategory = "") {
  const category = normalize(importedCategory);
  if (category) {
    if (/(meat|fish|seafood|poultry|chicken)/.test(category)) return "01-meat";
    if (/(dairy|egg)/.test(category)) return "02-dairy";
    if (/(vegetable|produce|veg)/.test(category)) return "03-vegetable";
    if (/(fruit)/.test(category)) return "04-fruit";
    if (/(grain|bread|pasta|rice|bakery)/.test(category)) return "05-grain";
    if (/(legume|bean|pulse)/.test(category)) return "06-legume";
    if (/(pantry|condiment|spice|oil|sauce)/.test(category)) return "07-pantry";
  }
  const value = normalize(name);
  if (/(beef|chicken|pork|bacon|ham|turkey|sausage|fish|salmon|tuna|shrimp|meat)/.test(value)) return "01-meat";
  if (/(milk|cheese|yogurt|cream|butter|egg)/.test(value)) return "02-dairy";
  if (/(potato|carrot|onion|garlic|leek|tomato|cucumber|pepper|lettuce|spinach|broccoli|vegetable|mushroom)/.test(value)) return "03-vegetable";
  if (/(apple|banana|orange|lemon|lime|berry|fruit)/.test(value)) return "04-fruit";
  if (/(pasta|rice|flour|bread|noodle|oat|grain)/.test(value)) return "05-grain";
  if (/(lentil|bean|chickpea|pea)/.test(value)) return "06-legume";
  if (/(salt|pepper|spice|mustard|sauce|oil|vinegar|tahini)/.test(value)) return "07-pantry";
  return "99-other";
}

function formatShoppingCategory(category) {
  const labels = {
    "01-meat": "Meat and fish",
    "02-dairy": "Dairy and eggs",
    "03-vegetable": "Vegetables",
    "04-fruit": "Fruit",
    "05-grain": "Grains and bread",
    "06-legume": "Beans and legumes",
    "07-pantry": "Pantry",
    "99-other": "Other"
  };
  return labels[category] || "Other";
}

function addRecipeOptions(select, selectedRecipeId = "") {
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Choose recipe";
  select.append(blank);
  state.recipes.forEach((recipe) => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.title;
    select.append(option);
  });
  select.value = state.recipes.some((recipe) => recipe.id === selectedRecipeId) ? selectedRecipeId : "";
}

function openEditor(recipe = null) {
  $("recipeForm").reset();
  $("recipeId").value = recipe?.id || "";
  $("dialogTitle").textContent = recipe ? "Edit recipe" : "New recipe";
  $("deleteRecipeButton").classList.toggle("hidden", !recipe);
  $("titleInput").value = recipe?.title || "";
  $("cuisineInput").value = recipe?.cuisine || "";
  $("minutesInput").value = recipe?.minutes || "";
  $("servingsInput").value = recipe?.servings || 4;
  $("tagsInput").value = (recipe?.tags || []).join(", ");
  $("ingredientsInput").value = (recipe?.ingredients || []).map((item) => formatIngredient(item)).join("\n");
  $("toolsInput").value = (recipe?.tools || []).join("\n");
  $("instructionsInput").value = recipe?.instructions || "";
  $("sourceInput").value = recipe?.source || "";
  $("favoriteInput").checked = Boolean(recipe?.favorite);
  recipeEditorInitialSnapshot = getRecipeEditorSnapshot();
  $("recipeDialog").showModal();
}

function getRecipeEditorSnapshot() {
  return JSON.stringify({
    id: $("recipeId").value,
    title: $("titleInput").value,
    cuisine: $("cuisineInput").value,
    minutes: $("minutesInput").value,
    servings: $("servingsInput").value,
    tags: $("tagsInput").value,
    ingredients: $("ingredientsInput").value,
    tools: $("toolsInput").value,
    instructions: $("instructionsInput").value,
    source: $("sourceInput").value,
    favorite: $("favoriteInput").checked
  });
}

function closeRecipeEditor() {
  $("recipeDialog").close();
}

function canDismissRecipeEditor() {
  return getRecipeEditorSnapshot() === recipeEditorInitialSnapshot;
}

async function imageToDataUrl(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveRecipe(event) {
  event.preventDefault();
  const id = $("recipeId").value || crypto.randomUUID();
  const existing = state.recipes.find((recipe) => recipe.id === id);
  const recipe = {
    id,
    title: $("titleInput").value.trim(),
    cuisine: $("cuisineInput").value.trim(),
    minutes: Number($("minutesInput").value) || 0,
    servings: Math.max(1, Number($("servingsInput").value) || 1),
    favorite: $("favoriteInput").checked,
    tags: $("tagsInput").value.split(",").map((tag) => tag.trim()).filter(Boolean),
    ingredients: parseIngredients($("ingredientsInput").value),
    tools: $("toolsInput").value.split(/\n+/).map((tool) => tool.trim()).filter(Boolean),
    instructions: $("instructionsInput").value.trim(),
    source: $("sourceInput").value.trim(),
    image: existing?.image || ""
  };
  state.recipes = existing
    ? state.recipes.map((item) => item.id === id ? recipe : item)
    : [recipe, ...state.recipes];
  saveState();
  $("recipeDialog").close();
  renderAll();
}

function openDetail(id) {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) return;
  currentDetailId = id;
  detailServings = recipe.servings || 1;
  renderDetail();
  $("detailDialog").showModal();
}

function renderDetail() {
  const recipe = state.recipes.find((item) => item.id === currentDetailId);
  if (!recipe) return;
  const multiplier = detailServings / (recipe.servings || 1);
  $("detailTitle").textContent = recipe.title;
  $("detailMeta").textContent = formatMeta(recipe);
  $("servingLabel").textContent = `${detailServings} servings`;
  renderTextList($("detailIngredients"), recipe.ingredients.map((item) => formatIngredient(item, multiplier)));
  renderTextList($("detailTools"), recipe.tools.length ? recipe.tools : ["No special tools"]);
  $("detailInstructions").textContent = recipe.instructions || "No instructions yet.";
  $("detailSource").classList.toggle("hidden", !recipe.source);
  $("detailSource").href = safeUrl(recipe.source);
}

function renderTextList(list, items) {
  list.innerHTML = "";
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  });
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function showScreen(screenId, title) {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  const navItem = document.querySelector(`.nav-item[data-screen="${screenId}"]`);
  if (navItem) navItem.classList.add("active");
  $(screenId).classList.add("active");
  $("screenTitle").textContent = title;
  $("addRecipeButton").classList.toggle("hidden", screenId !== "recipesScreen");
}

function wireEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.screen, button.dataset.title);
    });
  });

  $("addRecipeButton").addEventListener("click", () => openEditor());
  $("recipeSearch").addEventListener("input", renderRecipes);
  $("favoritesFilter").addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    $("favoritesFilter").classList.toggle("primary", favoritesOnly);
    renderRecipes();
  });
  $("addPantryButton").addEventListener("click", addPantry);
  $("pantryInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addPantry();
  });
  $("recipeForm").addEventListener("submit", saveRecipe);
  $("closeRecipeDialogButton").addEventListener("click", closeRecipeEditor);
  $("cancelRecipeButton").addEventListener("click", closeRecipeEditor);
  $("recipeDialog").addEventListener("click", (event) => {
    if (event.target === $("recipeDialog") && canDismissRecipeEditor()) closeRecipeEditor();
  });
  $("deleteRecipeButton").addEventListener("click", deleteCurrentRecipe);
  $("closeDetailButton").addEventListener("click", () => $("detailDialog").close());
  $("editFromDetailButton").addEventListener("click", () => {
    const recipe = state.recipes.find((item) => item.id === currentDetailId);
    $("detailDialog").close();
    openEditor(recipe);
  });
  $("shareRecipeButton").addEventListener("click", shareCurrentRecipe);
  $("planRecipeButton").addEventListener("click", openPlanRecipeDialog);
  $("planRecipeForm").addEventListener("submit", savePlannedRecipe);
  $("planDaySelect").addEventListener("change", updatePlanDayPreview);
  $("closePlanRecipeButton").addEventListener("click", () => $("planRecipeDialog").close());
  $("cancelPlanRecipeButton").addEventListener("click", () => $("planRecipeDialog").close());
  $("shoppingSortSelect").addEventListener("change", () => {
    state.settings.shoppingSort = $("shoppingSortSelect").value === "category" ? "category" : "recipe";
    state.checkedShopping = [];
    saveState();
    renderSettings();
    renderMealShoppingList();
  });
  $("copyShoppingButton").addEventListener("click", copyUncheckedShoppingList);
  $("clearShoppingButton").addEventListener("click", () => {
    state.checkedShopping = [];
    saveState();
    renderMealShoppingList();
  });
  $("servingMinus").addEventListener("click", () => {
    detailServings = Math.max(1, detailServings - 1);
    renderDetail();
  });
  $("servingPlus").addEventListener("click", () => {
    detailServings += 1;
    renderDetail();
  });
  $("exportButton").addEventListener("click", exportData);
  $("backupNowButton").addEventListener("click", exportData);
  $("importFile").addEventListener("change", importData);
  $("importCodeButton").addEventListener("click", openImportCodeDialog);
  $("importCodeForm").addEventListener("submit", importRecipeCode);
  $("closeImportCodeButton").addEventListener("click", () => $("importCodeDialog").close());
  $("cancelImportCodeButton").addEventListener("click", () => $("importCodeDialog").close());
  $("defaultMealServingsInput").addEventListener("input", saveDefaultMealServings);
  $("defaultMealServingsInput").addEventListener("change", saveDefaultMealServings);
  $("backupReminderDaysInput").addEventListener("input", saveBackupReminderDays);
  $("backupReminderDaysInput").addEventListener("change", saveBackupReminderDays);
  $("defaultShoppingSortSelect").addEventListener("change", saveDefaultShoppingSort);
  $("resetButton").addEventListener("click", resetSamples);
  $("reloadUpdateButton").addEventListener("click", () => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  });
}

function saveDefaultMealServings() {
    state.settings.defaultMealServings = clampServings($("defaultMealServingsInput").value);
    saveState();
    renderSettings();
}

function saveBackupReminderDays() {
  state.settings.backupReminderDays = clampBackupDays($("backupReminderDaysInput").value);
  saveState();
  renderSettings();
  renderBackupReminder();
}

function saveDefaultShoppingSort() {
  state.settings.shoppingSort = $("defaultShoppingSortSelect").value === "category" ? "category" : "recipe";
  state.checkedShopping = [];
  saveState();
  renderSettings();
  renderMealShoppingList();
}

async function shareCurrentRecipe() {
  const recipe = state.recipes.find((item) => item.id === currentDetailId);
  if (!recipe) return;
  try {
    const code = await encodeRecipeShare(recipe);
    if (navigator.share) {
      await navigator.share({
        title: recipe.title,
        text: code
      });
      return;
    }
    await navigator.clipboard.writeText(code);
    alert("Recipe code copied.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    alert(error.message || "The recipe code could not be created.");
  }
}

function openPlanRecipeDialog() {
  const recipe = state.recipes.find((item) => item.id === currentDetailId);
  if (!recipe) return;
  $("planRecipeName").textContent = recipe.title;
  $("planDaySelect").innerHTML = "";
  DAYS_OF_WEEK.forEach((day) => {
    const entry = state.mealPlan[day];
    const plannedRecipe = state.recipes.find((item) => item.id === entry?.recipeId);
    const option = document.createElement("option");
    option.value = day;
    option.textContent = plannedRecipe ? `${day} - ${plannedRecipe.title}` : day;
    $("planDaySelect").append(option);
  });
  $("planServingsInput").value = state.settings.defaultMealServings;
  updatePlanDayPreview();
  $("planRecipeDialog").showModal();
}

function updatePlanDayPreview() {
  const day = $("planDaySelect").value;
  const entry = state.mealPlan[day];
  const plannedRecipe = state.recipes.find((item) => item.id === entry?.recipeId);
  const message = plannedRecipe
    ? `Currently: ${plannedRecipe.title} for ${entry.servings} ${entry.servings === 1 ? "serving" : "servings"}`
    : "No recipe planned for this day.";
  $("planDayPreview").textContent = message;
  $("planDayPreview").classList.toggle("warning", Boolean(plannedRecipe));
}

function savePlannedRecipe(event) {
  event.preventDefault();
  const recipe = state.recipes.find((item) => item.id === currentDetailId);
  if (!recipe) return;
  const day = $("planDaySelect").value;
  if (!DAYS_OF_WEEK.includes(day)) return;
  state.mealPlan[day] = {
    recipeId: recipe.id,
    servings: clampServings($("planServingsInput").value)
  };
  saveState();
  $("planRecipeDialog").close();
  $("detailDialog").close();
  renderAll();
  showScreen("mealPlannerScreen", "Mealplanner");
}

function openImportCodeDialog() {
  $("recipeCodeInput").value = "";
  setRecipeCodeMessage("");
  $("importCodeDialog").showModal();
}

async function importRecipeCode(event) {
  event.preventDefault();
  setRecipeCodeMessage("");
  try {
    const decoded = await decodeRecipeShare($("recipeCodeInput").value);
    const existing = state.recipes.find((recipe) =>
      recipe.title.toLowerCase() === decoded.title.toLowerCase()
    );
    if (existing) {
      const replace = confirm(`A recipe named "${existing.title}" already exists.\n\nOK replaces it. Cancel imports this as a copy.`);
      if (replace) {
        decoded.id = existing.id;
        decoded.favorite = existing.favorite;
        state.recipes = state.recipes.map((recipe) => recipe.id === existing.id ? decoded : recipe);
      } else {
        decoded.id = crypto.randomUUID();
        decoded.title = getUniqueRecipeTitle(decoded.title);
        state.recipes = [decoded, ...state.recipes];
      }
    } else {
      state.recipes = [decoded, ...state.recipes];
    }
    saveState();
    $("importCodeDialog").close();
    renderAll();
    openDetail(decoded.id);
  } catch (error) {
    setRecipeCodeMessage(error.message || "This recipe code could not be imported.", true);
  }
}

function setRecipeCodeMessage(message, isError = false) {
  $("recipeCodeMessage").textContent = message;
  $("recipeCodeMessage").classList.toggle("error", isError);
}

function getUniqueRecipeTitle(baseTitle) {
  let candidate = `${baseTitle} (shared)`;
  let number = 2;
  while (state.recipes.some((recipe) => recipe.title.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${baseTitle} (shared ${number++})`;
  }
  return candidate;
}

async function encodeRecipeShare(recipe) {
  const shared = {
    t: recipe.title,
    c: recipe.cuisine || "",
    m: Math.max(1, Number(recipe.minutes) || 1),
    s: Math.max(1, Number(recipe.servings) || 1),
    i: recipe.instructions || "",
    u: recipe.source || "",
    g: (recipe.ingredients || []).map((item) => ({
      n: item.name || "",
      q: item.quantity ?? null,
      u: item.unit || "",
      p: "",
      x: "",
      s: "",
      c: ""
    })),
    k: recipe.tools || [],
    a: recipe.tags || []
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(shared));
  const compressed = await gzipBytes(jsonBytes);
  return `${RM1_BEGIN}${bytesToBase64Url(compressed)}${RM1_END}`;
}

async function decodeRecipeShare(code) {
  const compact = String(code || "").replace(/\s+/g, "");
  if (compact.length > MAX_RM1_CODE_LENGTH) {
    throw new Error("This recipe code is too large to import safely.");
  }

  let payload = "";
  if (compact.toUpperCase().startsWith(RM1_BEGIN)) {
    if (!compact.toUpperCase().endsWith(RM1_END)) {
      throw new Error("This recipe code is incomplete. It should end with RM1-END.");
    }
    payload = compact.slice(RM1_BEGIN.length, -RM1_END.length);
  } else if (compact.toUpperCase().startsWith(RM1_LEGACY_PREFIX)) {
    payload = compact.slice(RM1_LEGACY_PREFIX.length);
  } else {
    throw new Error("This is not a Recipe Manager sharing code. It should begin with RM1-BEGIN.");
  }

  const compressed = base64UrlToBytes(payload);
  const jsonBytes = await gunzipBytes(compressed);
  if (jsonBytes.byteLength > MAX_RM1_DECODED_BYTES) {
    throw new Error("This recipe code expands beyond the safe import limit.");
  }
  let shared;
  try {
    shared = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    throw new Error("The recipe code is damaged or incomplete.");
  }
  validateSharedRecipe(shared);
  return {
    id: crypto.randomUUID(),
    title: shared.t.trim(),
    cuisine: (shared.c || "").trim(),
    minutes: shared.m,
    servings: shared.s,
    favorite: false,
    tags: (shared.a || []).map((tag) => String(tag).trim()).filter(Boolean),
    ingredients: (shared.g || []).map((item) => ({
      quantity: item.q ?? null,
      unit: String(item.u || "").trim(),
      name: String(item.n || "").trim()
    })),
    tools: (shared.k || []).map((tool) => String(tool).trim()).filter(Boolean),
    instructions: (shared.i || "").trim(),
    source: (shared.u || "").trim(),
    image: ""
  };
}

function validateSharedRecipe(recipe) {
  const ingredients = recipe?.g || [];
  const tools = recipe?.k || [];
  const tags = recipe?.a || [];
  if (!recipe || typeof recipe !== "object") throw new Error("The recipe code contains no recipe.");
  if (!recipe.t || String(recipe.t).trim().length > 200) throw new Error("The shared recipe has an invalid name.");
  if (recipe.m < 1 || recipe.m > 1440) throw new Error("The shared recipe has an invalid cooking time.");
  if (recipe.s < 1 || recipe.s > 100) throw new Error("The shared recipe has an invalid serving count.");
  if (String(recipe.i || "").length > 200000 || String(recipe.u || "").length > 2000 || String(recipe.c || "").length > 200) {
    throw new Error("The shared recipe contains text that is too long.");
  }
  if (ingredients.length > 200 || tools.length > 100 || tags.length > 50) {
    throw new Error("The shared recipe contains too many ingredients, tools, or tags.");
  }
  if (ingredients.some((item) => {
    const quantity = item?.q;
    return !item
      || !String(item.n || "").trim()
      || String(item.n || "").length > 200
      || String(item.u || "").length > 50
      || String(item.p || "").length > 200
      || String(item.x || "").length > 1000
      || String(item.s || "").length > 50
      || String(item.c || "").length > 100
      || (quantity !== null && quantity !== undefined && (quantity <= 0 || quantity > 1000000));
  })) {
    throw new Error("The shared recipe contains an invalid ingredient.");
  }
  if (tools.some((tool) => String(tool).length > 200)) throw new Error("The shared recipe contains an invalid kitchen tool.");
  if (tags.some((tag) => !String(tag).trim() || String(tag).length > 50)) throw new Error("The shared recipe contains an invalid tag.");
}

async function gzipBytes(bytes) {
  if (!("CompressionStream" in window)) {
    throw new Error("This browser cannot create RM1 recipe codes.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot import RM1 recipe codes.");
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error("The recipe code is damaged or incomplete.");
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlToBytes(value) {
  try {
    let payload = value.replace(/-/g, "+").replace(/_/g, "/");
    payload = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), "=");
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new Error("The recipe code is damaged or incomplete.");
  }
}

function addPantry() {
  const value = $("pantryInput").value.trim();
  if (!value) return;
  if (!state.pantry.some((item) => normalize(item) === normalize(value))) state.pantry.push(value);
  $("pantryInput").value = "";
  saveState();
  renderAll();
}

function deleteCurrentRecipe() {
  const id = $("recipeId").value;
  state.recipes = state.recipes.filter((recipe) => recipe.id !== id);
  DAYS_OF_WEEK.forEach((day) => {
    if (state.mealPlan[day]?.recipeId === id) state.mealPlan[day] = { recipeId: "", servings: state.settings.defaultMealServings };
  });
  saveState();
  $("recipeDialog").close();
  renderAll();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const recipeCount = state.recipes.length;
  link.href = url;
  link.download = `Recipe-Pocket-backup-${timestamp}-v${APP_VERSION}-${recipeCount}-recipes.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.settings.lastBackupAt = new Date().toISOString();
  saveState();
  renderSettings();
  renderBackupReminder();
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = await readImportFile(file);
    const confirmed = confirm(
      `Import ${imported.recipes.length} recipes from ${imported.label}?\n\n` +
      `This replaces the recipes currently stored on this device.`
    );
    if (!confirmed) return;
    state = {
      recipes: imported.recipes,
      pantry: imported.pantry,
      checkedShopping: [],
      mealPlan: normalizeMealPlan(imported.mealPlan),
      settings: normalizeSettings({ ...state.settings, ...imported.settings })
    };
    saveState();
    renderAll();
    showToast(`Imported ${imported.recipes.length} recipes`);
  } catch (error) {
    alert(error.message || "That file could not be imported.");
  } finally {
    event.target.value = "";
  }
}

async function readImportFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isZipFile(bytes)) return readRecipeManagerCollection(bytes);
  const imported = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(imported.recipes)) throw new Error("This is not a Recipe Pocket backup.");
  return {
    label: "Recipe Pocket backup",
    recipes: imported.recipes.map(normalizePocketRecipe),
    pantry: Array.isArray(imported.pantry) ? imported.pantry : [],
    mealPlan: imported.mealPlan,
    settings: imported.settings
  };
}

function isZipFile(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function readRecipeManagerCollection(bytes) {
  const entries = await readZipEntries(bytes);
  const metadata = JSON.parse(entries["metadata.json"] || "{}");
  if (metadata.Format !== "PocketRecipeCollection") {
    throw new Error("This zip is not a Recipe Manager collection export.");
  }
  const exportedRecipes = JSON.parse(entries["recipes.json"] || "[]");
  const exportedIngredients = JSON.parse(entries["ingredients.json"] || "[]");
  if (!Array.isArray(exportedRecipes)) throw new Error("This collection has no recipes.json file.");
  const ingredientCategories = new Map(exportedIngredients.map((item) => [
    normalize(readValue(item, "Name", "name")),
    readValue(item, "Category", "category") || ""
  ]));
  return {
    label: `Recipe Manager collection (${metadata.SourceAppVersion || "unknown version"})`,
    recipes: exportedRecipes.map((recipe) => normalizeCollectionRecipe(recipe, ingredientCategories)),
    pantry: [],
    mealPlan: createEmptyMealPlan(),
    settings: {}
  };
}

function normalizePocketRecipe(recipe) {
  return {
    id: recipe.id || crypto.randomUUID(),
    title: String(recipe.title || "Untitled recipe").trim(),
    cuisine: String(recipe.cuisine || "").trim(),
    minutes: Math.max(0, Number(recipe.minutes) || 0),
    servings: clampServings(recipe.servings || 1),
    favorite: Boolean(recipe.favorite),
    tags: Array.isArray(recipe.tags) ? recipe.tags.map(String).filter(Boolean) : [],
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.map(normalizePocketIngredient).filter((item) => item.name) : [],
    tools: Array.isArray(recipe.tools) ? recipe.tools.map(String).filter(Boolean) : [],
    instructions: String(recipe.instructions || "").trim(),
    source: String(recipe.source || "").trim(),
    image: ""
  };
}

function normalizeCollectionRecipe(recipe, ingredientCategories) {
  const ingredients = readValue(recipe, "Ingredients", "ingredients") || [];
  return {
    id: crypto.randomUUID(),
    title: String(readValue(recipe, "Title", "title") || "Untitled recipe").trim(),
    cuisine: String(readValue(recipe, "Cuisine", "cuisine") || "").trim(),
    minutes: Math.max(0, Number(readValue(recipe, "CookingTimeMinutes", "minutes")) || 0),
    servings: clampServings(readValue(recipe, "Servings", "servings") || 1),
    favorite: Boolean(readValue(recipe, "IsFavorite", "favorite")),
    tags: normalizeStringList(readValue(recipe, "Tags", "tags")),
    ingredients: Array.isArray(ingredients)
      ? ingredients.map((item) => normalizeCollectionIngredient(item, ingredientCategories)).filter((item) => item.name)
      : [],
    tools: normalizeStringList(readValue(recipe, "Tools", "tools")),
    instructions: String(readValue(recipe, "Instructions", "instructions") || "").trim(),
    source: String(readValue(recipe, "SourceUrl", "source") || "").trim(),
    image: ""
  };
}

function normalizePocketIngredient(item) {
  return {
    quantity: item.quantity ?? null,
    unit: String(item.unit || "").trim(),
    name: String(item.name || "").trim(),
    category: String(item.category || "").trim()
  };
}

function normalizeCollectionIngredient(item, ingredientCategories) {
  const name = String(readValue(item, "Name", "name") || "").trim();
  return {
    quantity: readValue(item, "Quantity", "quantity") ?? null,
    unit: String(readValue(item, "Unit", "unit") || "").trim(),
    name,
    category: ingredientCategories.get(normalize(name)) || ""
  };
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function readValue(object, ...keys) {
  const key = keys.find((candidate) => object && Object.prototype.hasOwnProperty.call(object, candidate));
  return key ? object[key] : undefined;
}

async function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = {};
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("This collection zip is damaged.");
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (["metadata.json", "ingredients.json", "recipes.json"].includes(name)) {
      if (uncompressedSize > MAX_COLLECTION_IMPORT_BYTES) throw new Error("This collection is too large to import safely.");
      entries[name] = await readZipEntry(bytes, localHeaderOffset, compressionMethod, compressedSize);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(view) {
  const start = Math.max(0, view.byteLength - 66000);
  for (let offset = view.byteLength - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("This collection zip is missing its directory.");
}

async function readZipEntry(bytes, localHeaderOffset, compressionMethod, compressedSize) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) throw new Error("This collection zip is damaged.");
  const nameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataOffset = localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
  if (compressionMethod === 0) return new TextDecoder().decode(compressed);
  if (compressionMethod !== 8) throw new Error("This collection uses an unsupported zip compression method.");
  const decompressed = await inflateRaw(compressed);
  return new TextDecoder().decode(decompressed);
}

async function inflateRaw(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot import Recipe Manager collection zips.");
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
}

function resetSamples() {
  if (!confirm("Replace local Recipe Pocket data with sample recipes?")) return;
  state = { recipes: sampleRecipes.map((recipe) => ({ ...recipe, id: crypto.randomUUID() })), pantry: [], checkedShopping: [], mealPlan: createEmptyMealPlan(), settings: createDefaultSettings() };
  saveState();
  renderAll();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    let refreshing = false;
    const registration = await navigator.serviceWorker.register("service-worker.js");
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          $("updateBanner").classList.remove("hidden");
        }
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    registration.update();
  });
}

wireEvents();
renderAll();

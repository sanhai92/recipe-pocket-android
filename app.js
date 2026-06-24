const STORAGE_KEY = "recipe-pocket-data-v1";
const APP_VERSION = "1.0.0";
const APP_VERSION_NOTES = "Initial Android web app release";

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

const $ = (id) => document.getElementById(id);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        recipes: Array.isArray(parsed.recipes) ? parsed.recipes : sampleRecipes,
        pantry: Array.isArray(parsed.pantry) ? parsed.pantry : [],
        checkedShopping: Array.isArray(parsed.checkedShopping) ? parsed.checkedShopping : []
      };
    } catch {
      return { recipes: sampleRecipes, pantry: [], checkedShopping: [] };
    }
  }
  return { recipes: sampleRecipes, pantry: [], checkedShopping: [] };
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
  return parts.join(" · ");
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
  renderTags();
  renderRecipes();
  renderPantry();
  renderShoppingSelect();
  renderShoppingList();
}

function renderVersion() {
  $("appVersionLabel").textContent = `v${APP_VERSION}`;
  $("appVersionNotes").textContent = APP_VERSION_NOTES;
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
  node.querySelector(".favorite-mark").textContent = recipe.favorite ? "★" : "";
  const photo = node.querySelector(".photo");
  if (recipe.image) photo.style.backgroundImage = `url(${recipe.image})`;
  node.addEventListener("click", () => openDetail(recipe.id));
  return node;
}

function renderPantry() {
  const chips = $("pantryChips");
  chips.innerHTML = "";
  state.pantry.forEach((item) => {
    const button = document.createElement("button");
    button.className = "chip active";
    button.textContent = `${item} ×`;
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

function renderShoppingSelect() {
  const select = $("shoppingRecipe");
  const current = select.value;
  select.innerHTML = "";
  state.recipes.forEach((recipe) => {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.title;
    select.append(option);
  });
  if (state.recipes.some((recipe) => recipe.id === current)) select.value = current;
}

function renderShoppingList() {
  const recipe = state.recipes.find((item) => item.id === $("shoppingRecipe").value) || state.recipes[0];
  const list = $("shoppingList");
  list.innerHTML = "";
  if (!recipe) return;
  const pantrySet = new Set(state.pantry.map(normalize));
  recipe.ingredients.filter((item) => !pantrySet.has(normalize(item.name))).forEach((item) => {
    const label = document.createElement("label");
    const text = formatIngredient(item);
    label.className = `shopping-item ${state.checkedShopping.includes(text) ? "done" : ""}`;
    label.innerHTML = `<input type="checkbox"><span></span>`;
    const checkbox = label.querySelector("input");
    checkbox.checked = state.checkedShopping.includes(text);
    label.querySelector("span").textContent = text;
    checkbox.addEventListener("change", () => {
      state.checkedShopping = checkbox.checked
        ? [...new Set([...state.checkedShopping, text])]
        : state.checkedShopping.filter((x) => x !== text);
      saveState();
      renderShoppingList();
    });
    list.append(label);
  });
  if (!list.children.length) list.innerHTML = `<p class="empty">Everything is already in the pantry.</p>`;
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
  $("recipeDialog").showModal();
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
  const image = await imageToDataUrl($("imageInput").files[0]) || existing?.image || "";
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
    image
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
  $("detailHero").style.backgroundImage = recipe.image ? `url(${recipe.image})` : "";
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

function wireEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
      button.classList.add("active");
      $(button.dataset.screen).classList.add("active");
      $("screenTitle").textContent = button.dataset.title;
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
  $("shoppingRecipe").addEventListener("change", renderShoppingList);
  $("clearCheckedButton").addEventListener("click", () => {
    state.checkedShopping = [];
    saveState();
    renderShoppingList();
  });
  $("recipeForm").addEventListener("submit", saveRecipe);
  $("deleteRecipeButton").addEventListener("click", deleteCurrentRecipe);
  $("closeDetailButton").addEventListener("click", () => $("detailDialog").close());
  $("editFromDetailButton").addEventListener("click", () => {
    const recipe = state.recipes.find((item) => item.id === currentDetailId);
    $("detailDialog").close();
    openEditor(recipe);
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
  $("importFile").addEventListener("change", importData);
  $("resetButton").addEventListener("click", resetSamples);
  $("reloadUpdateButton").addEventListener("click", () => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  });
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
  saveState();
  $("recipeDialog").close();
  renderAll();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `recipe-pocket-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.recipes)) throw new Error("Invalid backup");
      state = {
        recipes: imported.recipes,
        pantry: Array.isArray(imported.pantry) ? imported.pantry : [],
        checkedShopping: []
      };
      saveState();
      renderAll();
    } catch {
      alert("That backup could not be imported.");
    }
  };
  reader.readAsText(file);
}

function resetSamples() {
  if (!confirm("Replace local Recipe Pocket data with sample recipes?")) return;
  state = { recipes: sampleRecipes.map((recipe) => ({ ...recipe, id: crypto.randomUUID() })), pantry: [], checkedShopping: [] };
  saveState();
  renderAll();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
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
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
  });
}

wireEvents();
renderAll();

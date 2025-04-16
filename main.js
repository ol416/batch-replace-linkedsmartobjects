const { app, constants } = require("photoshop");
const { localFileSystem: fs } = require("uxp").storage;
const { executeAsModal } = require("photoshop").core;
const { batchPlay } = require("photoshop").action;

// Forbidden characters in file paths
// \\ / : * ? " < > | #
const FORBIDDEN_CHARACTERS = /[#]/;

// 通过 ID 选择图层
const selectLayerById = async (layerID) => {
  try {
    await batchPlay(
      [
        {
          _obj: "select", // 表示选择操作
          _target: [{ _ref: "layer", _id: layerID }], // 目标图层
          makeVisible: false, // 可选，是否使图层可见
          _options: { dialogOptions: "dontDisplay" }, // 不显示任何对话框
        },
      ],
      {}
    );
    console.log(`Successfully selected layer with ID: ${layerID}`);
  } catch (error) {
    console.error(`Failed to select layer with ID: ${layerID}`, error);
    throw new Error(`Could not select layer with ID: ${layerID}`);
  }
};

// 获取所有图层（包括组内图层）
const getAllLayers = (layers = app.activeDocument?.layers, allLayers = []) => {
  if (!layers) return [];
  layers.forEach((layer) => {
    if (layer.kind !== constants.LayerKind.GROUP) {
      allLayers.push(layer);
    } else {
      getAllLayers(layer.layers, allLayers);
    }
  });
  return allLayers;
};

// 按名字获取目标图层
const getTargetLayers = (names) => {
  let allLayers = getAllLayers();
  console.log("All layers:", allLayers.map(layer => layer.name)); // 输出所有图层的名称

  let targetLayers = names
    .map(name => allLayers.find(layer => layer.name === name)) // 按名字顺序查找
    .filter(layer => layer); // 过滤掉未找到的图层

  console.log("Target layers:", targetLayers.map(layer => layer.name)); // 输出匹配到的目标图层
  return targetLayers;
};

// 替换链接智能对象的内容
const replaceLinkedSmartObject = async (layerID, filePath) => {
  try {
    console.log(`Replacing content for layer ID: ${layerID}, with file: ${filePath}`);

    // 通过 ID 选择目标图层
    await selectLayerById(layerID);
    let layer = app.activeDocument.activeLayer;
    let originlayername = layer.name;

    // 验证图层是否成功选择
    if (app.activeDocument.activeLayer.id !== layerID) {
      throw new Error(`Failed to select the layer with ID ${layerID}.`);
    }

    console.log(`Layer with ID ${layerID} selected successfully.`);

    // 验证文件路径是否正确
    let entry = await fs.getEntryWithUrl("file:" + filePath);
    console.log("File entry:", entry);

    let token = await fs.createSessionToken(entry);
    console.log("Session token created:", token);

    // 使用 batchPlay 替换链接内容
    await batchPlay(
      [
        {
          _obj: "placedLayerReplaceContents",
          null: { _path: token, _kind: "local" },
          layerID: layerID,
          _options: { dialogOptions: "dontDisplay" },
        },
      ],
      {}
    );

    layer.name = originlayername;
    console.log(`Restored layer name to: ${originlayername}`);
    console.log(`Successfully replaced content for layer ID ${layerID}.`);
  } catch (error) {
    console.error(`Error replacing linked smart object for layer ID ${layerID}:`, error);
    app.showAlert(`Error replacing linked smart object: ${error.message}`);
  }
};

const validateLinkedSmartObject = (layer) => {
  if (!layer) return false;

  let isSmartObject = layer.kind === constants.LayerKind.SMARTOBJECT;
  // let isLinked = layer.isLinked; // 检查是否为链接智能对象
  let isLinked = true; // 检查是否为链接智能对象

  console.log(`Layer: ${layer.name}, Smart Object: ${isSmartObject}, Linked: ${isLinked}`);
  return isSmartObject && isLinked;
};

// 按名字顺序替换链接智能对象内容
const replaceLinkedLayersByName = async (layerNames, imagePaths) => {
  let targetLayers = getTargetLayers(layerNames);

  console.log("Target layers to replace:", targetLayers.map(layer => layer.name));

  // 验证目标图层是否为链接智能对象
  let validLayers = targetLayers.filter((layer) =>
    validateLinkedSmartObject(layer)
  );
  if (validLayers.length === 0) {
    app.showAlert("未找到链接智能对象，请检查图层设置。");
    return;
  }

  if (imagePaths.length > validLayers.length) {
    app.showAlert("提供的图片多于匹配的图层，部分图片将被忽略。");
  }
  let progressList = [];
  await executeAsModal(async () => {
    for (let i = 0; i < Math.min(imagePaths.length, validLayers.length); i++) {
      let layer = validLayers[i];

      // 自动选择目标图层
      app.activeDocument.activeLayer = layer;
      // 通过 ID 选择目标图层
      await selectLayerById(layer.id);

      // 验证图层是否成功选择
      if (app.activeDocument.activeLayer.id !== layer.id) {
        throw new Error(`Failed to select the layer with ID ${layer.id}.`);
      }

      console.log(`Layer with ID ${layer.id} selected successfully.`);
      progressList.push(`图层: ${layer.name} 替换为: ${imagePaths[i]}`);
      await replaceLinkedSmartObject(layer.id, imagePaths[i]);
      // 更新转换过程
    }
  }, { commandName: "替换链接的智能对象" });
  // 更新 HTML 中的进度列表
  const progressElement = document.getElementById("progressList");
  progressElement.innerHTML = `
    <ul>${progressList.map((item) => `<li>${item}</li>`).join("")}</ul>
  `;

  app.showAlert("按名字替换链接智能对象完成！");
};

// 按钮事件监听
document.getElementById("btnReplace").addEventListener("click", async () => {
  const textarea = document.getElementById("imageURLs");
  let input = textarea.value; // 获取 sp-textarea 的值
  input = input.replace(/'|"/g, "");
  if (!input) {
    app.showAlert("请输入至少一张图片的路径。");
    return;
  }

  // 将用户输入的图片路径解析为数组
  const imagePaths = input
    .split(/\r|\n/)
    .map((url) => url.trim())
    .filter((url) => url);
  console.log("Input image paths:", imagePaths);

  // Early validation for forbidden characters
  for (const path of imagePaths) {
    if (FORBIDDEN_CHARACTERS.test(path)) {
      app.showAlert(`文件路径中包含无效字符。请避免使用以下字符: ${FORBIDDEN_CHARACTERS.source.replace(/[\[\]]/g, '')}，路径： ${path}`);
      return; // Stop execution if invalid characters are found
    }
  }

  // 按名字顺序替换链接智能对象
  const layerNames = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
  await replaceLinkedLayersByName(layerNames, imagePaths);
});

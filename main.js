const { app, constants } = require("photoshop");
const { localFileSystem: fs } = require("uxp").storage;
const { executeAsModal } = require("photoshop").core;
const { batchPlay } = require("photoshop").action;

// --- 通用对话框组件 ---
class UXPDialog {
  constructor() {
    this.dialog = document.createElement("dialog");
    this.form = document.createElement("form");
    this.heading = document.createElement("sp-heading");
    this.divider = document.createElement("sp-divider");
    this.body = document.createElement("sp-body");
    this.footer = document.createElement("footer");
    this.confirmButton = document.createElement("sp-button");
    this.cancelButton = document.createElement("sp-button");

    this.form.method = "dialog";
    this.dialog.appendChild(this.form);
    this.form.appendChild(this.heading);
    this.form.appendChild(this.divider);
    this.form.appendChild(this.body);
    this.form.appendChild(this.footer);
    this.footer.appendChild(this.cancelButton);
    this.footer.appendChild(this.confirmButton);
    document.body.appendChild(this.dialog);
  }

  async show(options) {
    this.heading.textContent = options.title || "";
    this.body.textContent = options.message || "";
    this.confirmButton.textContent = options.confirmLabel || "确认";
    this.confirmButton.setAttribute("variant", options.confirmVariant || "cta");
    this.cancelButton.textContent = options.cancelLabel || "取消";
    this.cancelButton.setAttribute("variant", options.cancelVariant || "secondary");
    this.cancelButton.setAttribute("quiet", "true");

    this.confirmButton.onclick = () => {
      this.dialog.close("ok");
    };

    this.cancelButton.onclick = () => {
      this.dialog.close("reasonCanceled");
    };

    const result = await this.dialog.uxpShowModal({
      title: options.dialogTitle || "提示",
      resize: "none",
      size: options.size || { width: 480, height: 240 },
    });

    this.dialog.remove();
    return result;
  }

  // 切换提示模式
  // 定义一个异步函数showAlert，用于显示提示框
  async showAlert(options) {
    this.heading.textContent = options.title || "提示";
    this.body.textContent = options.message || "";
    this.confirmButton.textContent = options.confirmLabel || "确定";
    this.confirmButton.setAttribute("variant", options.confirmVariant || "primary");
    this.cancelButton.style.display = "none"; // 隐藏取消按钮

    this.confirmButton.onclick = () => {
      this.dialog.close("ok");
    };

    const result = await this.dialog.uxpShowModal({
      title: options.dialogTitle || "提示",
      resize: "none",
      size: options.size || { width: 480, height: 180 },
    });

    this.dialog.remove();
    return result;
  }
}

// --- 实例化通用对话框 ---
const uxpDialog = new UXPDialog();

// --- 以下是之前的代码，做了修改以使用通用对话框 ---

// 通过 ID 选择图层
const selectLayerById = async (layerID) => {
  try {
    await batchPlay(
      [
        {
          _obj: "select", // 表示选择操作
          _target: [
            { _ref: "layer", _id: layerID }, // 目标图层
          ],
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
    .map((name) => allLayers.find((layer) => layer.name === name)) // 按名字顺序查找
    .filter((layer) => layer); // 过滤掉未找到的图层

  console.log("Target layers:", targetLayers.map((layer) => layer.name));
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
    //app.showAlert(`Error replacing linked smart object: ${error.message}`);
    await uxpDialog.showAlert({ message: `Error replacing linked smart object: ${error.message}` });
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

  console.log("Target layers to replace:", targetLayers.map((layer) => layer.name));
  // 验证目标图层是否为链接智能对象
  let validLayers = targetLayers.filter((layer) => validateLinkedSmartObject(layer));
  if (validLayers.length === 0) {
    //app.showAlert("未找到链接智能对象，请检查图层设置。");
    await uxpDialog.showAlert({ message: "未找到链接智能对象，请检查图层设置。" });
    return;
  }

  if (imagePaths.length > validLayers.length) {
    //app.showAlert("提供的图片多于匹配的图层，部分图片将被忽略。");
    await uxpDialog.showAlert({ message: "提供的图片多于匹配的图层，部分图片将被忽略。" });
  }
  let progressList = [];
  await executeAsModal(
    async () => {
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
  }, { commandName: "批量替换链接智能对象" });
  // 更新 HTML 中的进度列表
  const progressElement = document.getElementById("progressList");
  progressElement.innerHTML = `
    <ul>${progressList.map((item) => `<li>${item}</li>`).join("")}</ul>
  `;

  //app.showAlert("按名字替换链接智能对象完成！");
};

// 按钮事件监听
document.getElementById("btnReplace").addEventListener("click", async () => {
  const textarea = document.getElementById("imageURLs");
  let input = textarea.value; // 获取 sp-textarea 的值
  input = input.replace(/'|"/g, "");
  if (!input) {
    //app.showAlert("请输入至少一张图片的路径。");
    await uxpDialog.showAlert({ message: "请输入至少一张图片的路径。" });
    return;
  }

  // 将用户输入的图片路径解析为数组
  const imagePaths = input.split(/\r|\n/).map((url) => url.trim()).filter((url) => url);
  console.log("Input image paths:", imagePaths);

  for (let path of imagePaths) {
    try {
      let entry = await fs.getEntryWithUrl("file:" + path);
      console.log(`File exists for path: ${path}`, entry);
    } catch (error) {
      console.error(`Invalid file path: ${path}`, error);
      //app.showAlert(`文件路径无效: ${path}`);
      await uxpDialog.showAlert({ message: `文件路径无效: ${path}` });
      return;
    }
  }

  // 使用通用对话框
  const result = await uxpDialog.show({
    dialogTitle: "确认替换",
    title: "确认替换",
    message: "确认要替换链接智能对象吗？",
    confirmLabel: "确认",
    cancelLabel: "取消",
  });

  if (result === "ok") {
    const layerNames = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
    await replaceLinkedLayersByName(layerNames, imagePaths);
    //app.showAlert("按名字替换链接智能对象完成！");
    await uxpDialog.showAlert({ message: "按名字替换链接智能对象完成！" });
  }
});

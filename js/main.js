'use strict';
/* メインのclamp()のコードの生成を管理する処理
  ------------------------------------------*/
class ClampGenerator {
  static CLASSES = {
    inputs: 'js-inputs',
    options: 'js-options',
    output_area: 'js-output-area',
    output_button: 'js-output-button'
  };
  static PX_TO_REM_RATIO = 0.0625;

  constructor() {
    this.targets = this.getJsTargets();
    this.currentUnits = this.initializeSelectedUnits(this.targets.inputs);
    this.inputData = this.initializeData(this.targets.inputs);
    this.clampData = {};
    this.outputTextData;
    this.updateOutputText();
    this.initEventListeners();
  }

  //イベントリスナー初期設定
  initEventListeners() {
    this.targets.inputs.addEventListener('change', (event) => {
      const target = event.target;
      target.type === 'radio' ? this.toggleInputUnit(target) : this.updatePxValue(target);
      this.updateOutputText();
    });
    this.targets.options.addEventListener('change', () => this.updateOutputText());
    this.targets.output_button.addEventListener('click', (event) =>
      this.copyClampFuncToClipBoard(this.outputTextData, event.target)
    );
  }

  //CLASSESで定義した要素を一括取得するメソッド
  getJsTargets() {
    const targets = {};
    for (const [key, className] of Object.entries(ClampGenerator.CLASSES)) {
      targets[key] = document.querySelector(`.${className}`);
    }
    return targets;
  }

  //選択単位初期化
  initializeSelectedUnits(inputs) {
    const radioInputs = [...inputs.querySelectorAll('input[type="radio"]:checked')];
    const REMOVE_STR = 'unit';
    const obj = {};
    for (const input of radioInputs) {
      const key = input.name.replace(REMOVE_STR, '');
      obj[key] = input.value;
    }
    return obj;
  }

  //数値初期値取得
  initializeData(inputs) {
    const numberInputs = [...inputs.querySelectorAll('input[type="number"]')];
    const CATEGORIES = ['Size', 'Vp'];
    const data = numberInputs.map((input) => {
      const displayValue = parseFloat(input.value);
      const name = input.name;
      const category = name.includes(CATEGORIES[0]) ? CATEGORIES[0] : CATEGORIES[1];
      const isRem = this.currentUnits[category] === 'rem';
      const pxValue = isRem ? this.convertRemToPx(displayValue) : parseInt(displayValue);
      return { name, input, category, displayValue, pxValue };
    });

    return data;
  }

  //入力値の単位変更の反映
  toggleInputUnit(target) {
    const REMOVE_STR = 'unit';
    const newUnit = target.value;
    const key = target.name.replace(REMOVE_STR, '');
    this.currentUnits[key] = newUnit;
    const filteredData = this.inputData.filter((data) => data.category === key);
    for (const data of filteredData) {
      const pxValue = data.pxValue;
      data.displayValue = newUnit === 'rem' ? this.customRounded(this.convertPxToRem(pxValue)) : pxValue;
      data.input.value = data.displayValue;
    }
  }

  //入力値の更新
  updatePxValue(target) {
    const changedData = this.inputData.find((data) => data.name === target.name);
    const isRem = this.currentUnits[changedData.category] === 'rem';
    const newValue = isRem ? parseFloat(target.value) || 0 : parseInt(target.value) || 0;
    target.value = newValue;
    changedData.displayValue = newValue;
    changedData.pxValue = isRem ? this.convertRemToPx(newValue) : newValue;
  }

  //数値のPX<>REM変換
  convertRemToPx(value) {
    return parseInt(value / ClampGenerator.PX_TO_REM_RATIO);
  }

  convertPxToRem(value) {
    return value * ClampGenerator.PX_TO_REM_RATIO;
  }

  // 小数点以下の値を指定した桁数で四捨五入
  customRounded(value, args = 3) {
    const decimalPlace = 10 ** args;
    return Math.round(value * decimalPlace) / decimalPlace;
  }

  // アウトプットテキストの更新処理
  updateOutputText() {
    this.outputTextData = this.setClampFuncText();
    this.overwriteOutputText(this.outputTextData);
  }

  // Clamp式の生成
  setClampFuncText() {
    // inputのname属性
    const NAME = {
      unit: 'option-unit',
      comment: 'option-comment',
      property: 'option-property'
    };

    const KEYS = ['minSize', 'maxSize', 'minVp', 'maxVp'];

    // 単位付きの値を返す関数
    const setConvertedValueWithUnits = (value, unit, isIntercept) => {
      const isRem = unit === 'rem';
      let convertedValue = isRem ? this.convertPxToRem(value) : value;
      convertedValue = isIntercept ? Math.abs(this.customRounded(convertedValue)) : convertedValue;
      return `${convertedValue}${unit}`;
    };

    // 出力オプションの選択値取得
    const getCheckedOptionValue = (nameValue) => {
      return this.targets.options.querySelector(`input[name="${nameValue}"]:checked`).value;
    };

    const currentUnit = getCheckedOptionValue(NAME.unit);
    const outputProperty = getCheckedOptionValue(NAME.property);
    const isShowComment = getCheckedOptionValue(NAME.comment) === 'true';

    const values = {};
    for (const key of KEYS) values[key] = this.getPxValue(key);
    const vpDifference = values.maxVp - values.minVp;
    const sizeDifference = values.maxSize - values.minSize;

    // vpの最大最小の差が無い場合はnullを返す。
    if (vpDifference === 0) return null;

    const slope = sizeDifference / vpDifference;
    const intercept = values.minSize - values.minVp * slope;
    const sign = intercept < 0 ? '-' : '+';

    // 出力処理
    const minSizeStr = setConvertedValueWithUnits(values.minSize, currentUnit);
    const maxSizeStr = setConvertedValueWithUnits(values.maxSize, currentUnit);
    const slopeStr = `${this.customRounded(slope * 100)}vw`;
    const interceptStr = setConvertedValueWithUnits(intercept, currentUnit, true);
    const clampFunc = `clamp(${minSizeStr}, ${slopeStr} ${sign} ${interceptStr}, ${maxSizeStr})`;
    const outputFunc = outputProperty === 'none' ? clampFunc : `${outputProperty}: ${clampFunc};`;
    const comment = `/* size: ${values.minSize}px -> ${values.maxSize}px, viewport: ${values.minVp}px -> ${values.maxVp}px */`;
    this.clampData = { slope, intercept, clampFunc };
    return isShowComment ? [outputFunc, comment] : [outputFunc];
  }

  //出力テキスト更新処理
  overwriteOutputText(argsData) {
    const IS_ERROR = 'is-error';
    const textData = argsData || this.setErrorText();
    const outputElements = [...this.targets.output_area.querySelectorAll('p')];
    for (const [index, element] of outputElements.entries()) {
      element.textContent = textData[index];
      !argsData ? element.classList.add(IS_ERROR) : element.classList.remove(IS_ERROR);
    }
  }

  // エラーテキスト作成(英文対応)
  setErrorText() {
    const ERROR_TEXT = {
      JP: ['ビューポートの最小値と最大値の差が0のため、clamp関数を生成できません'],
      EN: [
        "The difference between the viewport's minimum and maximum values ​​is 0, so a clamp function can't be generated."
      ]
    };
    const isEn = appInstances?.bilingual?.isEnglish?.() ?? false;
    return isEn ? ERROR_TEXT.EN : ERROR_TEXT.JP;
  }

  // クリップボードにclamp式をコピーする
  async copyClampFuncToClipBoard(textData, target) {
    if (!textData) return;
    const IS_ACTIVE = 'is-active';
    const resultsPopup = target.nextElementSibling;
    const copyingText = textData.length === 2 ? `${textData[0]}\n${textData[1]}` : `${textData[0]}`;
    await navigator.clipboard.writeText(copyingText);
    resultsPopup.classList.add(IS_ACTIVE);
    target.disabled = true;
    target.blur();
    resultsPopup.addEventListener('animationend', () => {
      resultsPopup.classList.remove(IS_ACTIVE);
      target.disabled = false;
    });
  }

  // pxベースの入力値取得処理
  getPxValue(name) {
    return this.inputData.find((data) => data.name === name).pxValue;
  }
}

//インスタンス初期化処理
const initClampGenerator = () => {
  try {
    return new ClampGenerator();
  } catch (error) {
    console.error(`[${ClampGenerator.name}]:${error.message}`);
    return null;
  }
};

/* ▲ ここまでclamp生成処理▲ */

/* プレビューを制御するクラス
  ------------------------------------------*/
class Preview {
  static CLASSES = {
    func: 'js-preview-func',
    width: 'js-preview-width',
    fontSize: 'js-preview-font-size',
    widthText: 'js-preview-width-text',
    outputText: 'js-preview-output-text'
  };

  constructor() {
    this.targets = this.getJsTargets();
  }

  //イベントリスナー初期設定
  initEventListeners() {}

  //CLASSESで定義した要素を一括取得するメソッド
  getJsTargets() {
    const targets = {};
    for (const [key, className] of Object.entries(Preview.CLASSES)) {
      targets[key] = document.querySelector(`.${className}`);
    }
    return targets;
  }

  useClampGeneratorData(instance) {
    // 渡されたインスタンスがClampGeneratorか判定
    const INSTANCE_CLASS = ClampGenerator;
    const isClampGenerator = instance instanceof INSTANCE_CLASS;
    return isClampGenerator ? instance : null;
  }
}

//インスタンス初期化処理
const initPreview = () => {
  try {
    return new Preview();
  } catch (error) {
    console.error(`[${Preview.name}]:${error.message}`);
    return null;
  }
};

/* ▲ ここまでプレビュー処理▲ */

/* モーダル制御処理を作成するクラス
  ------------------------------------------*/
class MyModalDialog {
  static CLASSES = {
    MODAL: 'js-modal__target',
    OPEN: 'js-modal__open',
    CLOSE: 'js-modal__close',
    ANCESTOR_ANCHOR: 'js-modal__anchors'
  };
  constructor(modalElement) {
    this.modalElement = this.assignElementOrThrowError(modalElement);
    this.modalName = this.modalElement.dataset.name || this.throwUndefinedError(this.modalElement);
    this.openElement = this.getElementHasDataName('OPEN', this.modalName);
    this.closeElement = this.getElementHasDataName('CLOSE', this.modalName);
    this.ancestorAnchorElement = this.getElementHasDataName('ANCESTOR_ANCHOR', this.modalName, false);
    this.initEventListeners();
  }

  //イベントリスナーの初期化
  initEventListeners() {
    this.openElement.addEventListener('click', () => this.openModal());
    this.closeElement.addEventListener('click', () => this.closeModal());
    this.modalElement.addEventListener('click', (event) => event.target === event.currentTarget && this.closeModal());
    if (this.ancestorAnchorElement)
      this.ancestorAnchorElement.addEventListener('click', (event) => this.closeModalIfLinkClicked(event));
  }

  // モーダルのオンオフを制御
  openModal() {
    this.modalElement.showModal();
  }
  closeModal() {
    this.modalElement.close();
  }

  // モーダル内のリンクをクリックした場合も閉じる
  closeModalIfLinkClicked(event) {
    const isLinkClicked = event.target.closest('a');
    if (!isLinkClicked) return;
    this.closeModal();
  }

  // *** DOMから取得した要素の検証処理 ***
  //要素の場合のみ代入
  assignElementOrThrowError(element) {
    if (element instanceof HTMLElement) {
      return element;
    } else {
      throw new Error(`コンストラクターで要素以外の値が渡されました`);
    }
  }

  // 特定のデータ属性を持つ要素の取得処理
  getElementHasDataName(classKey, dataName, isRequired = true) {
    const className = MyModalDialog.CLASSES[classKey];
    const element = document.querySelector(`.${className}[data-name="${dataName}"]`);
    if (isRequired && !element) this.throwNullError(className, dataName);
    return element;
  }

  // 要素が見つからない場合はエラー
  throwNullError(className, dataName) {
    throw new Error(`data-name="${dataName}", class="${className}"の要素が見つかりません`);
  }

  //引数がundefinedの場合はエラー
  throwUndefinedError(element) {
    throw new Error(`class="${element.classList}"のモーダルの要素に[data-name]属性が未設定です`);
  }
}

/* モーダルの制御処理を一括で初期化
  ------------------------------------------*/
const initModals = () => {
  const modalElements = [...document.querySelectorAll(`dialog.${MyModalDialog.CLASSES.MODAL}`)];
  const modals = modalElements.map((modalElement) => {
    try {
      return new MyModalDialog(modalElement);
    } catch (error) {
      console.error(`[${MyModalDialog.name}]インスタンスの生成に失敗しました:${error.message}`);
      return null;
    }
  });
  return modals;
};

/* ▲ ここまでモーダルの生成処理 ▲ */

/* 日本語以外の言語環境の設定反映処理
  ------------------------------------------*/
class Bilingual {
  static EN_SWITCH = 'js-en-switch';

  constructor() {
    this.englishSwitch = document.querySelector(`.${Bilingual.EN_SWITCH}`);
    this.isJapanese = window.navigator.language === 'ja';
    if (!this.isJapanese) this.englishSwitch.checked = true;
  }

  isEnglish() {
    if (!this.englishSwitch) return false;
    return this.englishSwitch.checked;
  }
}

//インスタンス初期化処理
const initBilingual = () => {
  try {
    return new Bilingual();
  } catch (error) {
    console.error(`[${Bilingual.name}]:${error.message}`);
    return null;
  }
};

/* ▲ ここまで言語環境設定の固定処理 ▲ */
const appInstances = {};
const initAll = () => {
  appInstances.bilingual = initBilingual();
  appInstances.clampGenerator = initClampGenerator();
  appInstances.modals = initModals();
  appInstances.preview = initPreview();
};
initAll();

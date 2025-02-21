/* eslint-disable max-statements */
import {Events} from './consts';
let captureWorker: null | Worker = null;
function workerPost(info: {type: string, [key: string]: unknown}) {
    captureWorker && captureWorker.postMessage({
        ...info,
    });
}
async function initWorker(url: URL|string, wasmPath: URL|string): Promise<Worker> {
    if (captureWorker) {
        return captureWorker;
    }
    // captureWorker = new Worker(new URL('./capture.worker.js', import.meta.url));
    captureWorker = new Worker(url);
    workerPost({
        type: 'initPath',
        info: wasmPath.toString(),
    });
    const promise = new Promise<Worker>(resolve => {
        captureWorker && captureWorker.addEventListener('message', e => {
            if (e?.data?.type === 'init') {
                // wasm初始化完毕
                resolve(captureWorker);
            }
        });
    });
    return promise;
}
interface PrevType {
    url?: string[];
    blob?: Blob[];
}
interface nowType {
    url: string;
    blob?: Blob;
}
interface MetaDatatype {
    description: string;
}
interface CallbackType {
    onChange?: (prev: PrevType, now: nowType, info: {width: number, height: number, duration: number}) => void;
    onSuccess?: ((prev: PrevType & {meta: MetaDatatype | string}) => void) | (() => void);
    onError?: (errmeg: string) => void;
}
interface MapInfoType extends CallbackType{
    url?: string[];
}
interface CaptureInfo extends CallbackType{
    info?: number[] | number | string;
    path?: string;
    file: File | Blob;
    returnType?: 'blob' | 'base64'; // 默认blob
}
function createRequest() {
    let currentId = 0;
    const map: Map<number, CallbackType & {cache?: MapInfoType}> = new Map();
    return {
        // 获取视频唯一id
        setCallback(item: CallbackType) {
            const id = ++currentId;
            map.set(currentId, {
                ...item,
                cache: {},
            });
            return id;
        },
        // 设置
        getCbk(idx: number) {
            return map.get(idx);
        },
        // 删除
        deleteCbk(idx: number) {
            map.delete(idx);
        },
    };
}
const pool = createRequest();
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;

function rotateImage(imageData, direction = 'l') {
    const H = imageData.height;
    const W = imageData.width;
    const imgDt1 = new ImageData(H, W);
    const imgDt2 = new ImageData(H, W);
    const dt0 = imageData.data;
    const dt1 = imgDt1.data;
    const dt2 = imgDt2.data;

    // 2. Transposex
    let r = 0;
    let r1 = 0; // index of red pixel in old and new ImageData, respectively
    for (let y = 0, lenH = H; y < lenH; y++) {
        for (let x = 0, lenW = W; x < lenW; x++) {
            r = (x + lenW * y) * 4;
            r1 = (y + lenH * x) * 4;
            dt1[r1 + 0] = dt0[r + 0];
            dt1[r1 + 1] = dt0[r + 1];
            dt1[r1 + 2] = dt0[r + 2];
            dt1[r1 + 3] = dt0[r + 3];
        }
    }

    // 3. Reverse width / height
    for (let y = 0, lenH = W; y < lenH; y++) {
        for (let x = 0, lenW = H; x < lenW; x++) {
            r = (x + lenW * y) * 4;
            r1 = direction === 'l'
                ? (x + lenW * (lenH - 1 - y)) * 4
                : ((lenW - 1 - x) + lenW * y) * 4;
            dt2[r1 + 0] = dt1[r + 0];
            dt2[r1 + 1] = dt1[r + 1];
            dt2[r1 + 2] = dt1[r + 2];
            dt2[r1 + 3] = dt1[r + 3];
        }
    }
    return imgDt2;
}
async function getUrl(width: number, height: number, imageDataBuffer, angle: number):
Promise<{url: string, blob?: Blob}> {
    let canvasWith = width;
    let canvasHeight = height;
    const imageData = new ImageData(imageDataBuffer, width, height);
    let imgData = null;
    switch (angle / 90) {
        case 1:
            imgData = rotateImage(imageData, 'r');
            canvasWith = height;
            canvasHeight = width;
            break;
        case 2:
            imgData = rotateImage(imageData, 'r');
            imgData = rotateImage(imageData, 'r');
            break;
        case 3:
            imgData = rotateImage(imageData, 'l');
            canvasWith = height;
            canvasHeight = width;
            break;
        default:
            imgData = imageData;
            break;
    }
    canvas.width = canvasWith;
    canvas.height = canvasHeight;
    ctx.putImageData(imgData, 0, 0, 0, 0, canvasWith, canvasHeight);
    // const blob = new Blob([imageDataBuffer.buffer], {type: 'image/png'} /* (1) */);
    return {
        url: canvas.toDataURL('image/jpeg'),
        // blob: blob,
    };
}

function startCapture(id: number, info: CaptureInfo['info'], path: CaptureInfo['path'], file: CaptureInfo['file']) {
    workerPost({
        type: Events.startCapture,
        id,
        info,
        path,
        file,
    });
}

class Capture {
    file: File | Blob = null;
    path: string = null;
    capture(data: CaptureInfo) {
        const {info, path = this.path, file = this.file, ...func} = data;
        this.file = file;
        this.path = path;
        const id = pool.setCallback(func);
        startCapture(id, info, path, this.file);
    }

    mountFile(data: CaptureInfo) {
        const {file, path, info, ...func} = data;
        this.file = file;
        this.path = path;
        const id = pool.setCallback(func);
        workerPost({
            type: Events.mountFile,
            id,
            path,
            file,
        });
    }

    getMetadata(data: CaptureInfo) {
        const {info, ...func} = data;
        const id = pool.setCallback(func);
        workerPost({
            type: Events.getMetadata,
            id,
            info, // 相当于是key
        });
    }

    free(data: CaptureInfo) {
        const id = pool.setCallback(data || {});
        workerPost({
            type: Events.free,
            id,
        });
    }

}


export async function initCapture({
    workerPath,
    wasmPath,
}: {
    workerPath: URL | string;
    wasmPath: URL | string;
}) {
    const worker = await initWorker(workerPath, wasmPath);
    worker.addEventListener('message', async e => {
        switch (e?.data?.type) {
            case Events.receiveImageOnchange: {
                const {imageDataBuffer, width, height, duration, id, meta = {}} = e.data || {};
                const {angle = 0} = meta;
                const img = await getUrl(width, height, imageDataBuffer, angle);
                const cbk = pool.getCbk(id);
                const {onChange} = cbk;
                const info = {width, height, duration: Number(duration) / 1000};
                const {cache} = pool.getCbk(id);
                cache.url = cache?.url || [];
                onChange && onChange({url: cache.url}, img, info);
                cache.url.push(img.url);
                break;
            }
            case Events.receiveImageOnSuccess: {
                const {id, meta} = e.data || {};
                const cbk = pool.getCbk(id) || {};
                const {onSuccess} = cbk;
                const {cache} = pool.getCbk(id);
                onSuccess && onSuccess({
                    url: cache.url,
                    meta: meta as MetaDatatype,
                });
                break;
            }
            case Events.receiveError: {
                const {errmsg, id} = e.data || {};
                const cbk = pool.getCbk(id) || {};
                const {onError} = cbk;
                onError && onError(errmsg);
                break;
            }
            case Events.getMetadataOnSuccess: {
                const {id, meta} = e.data || {};
                const cbk = pool.getCbk(id) || {};
                const {onSuccess} = cbk;
                onSuccess && onSuccess({meta: meta as string});
                break;
            }
            case Events.mountFileSuccess: {
                const {id} = e.data || {};
                const cbk = pool.getCbk(id);
                const {onSuccess} = cbk;
                onSuccess && onSuccess();
                break;
            }
            case Events.freeOnSuccess: {
                const {id} = e.data || {};
                const cbk = pool.getCbk(id);
                const {onSuccess} = cbk;
                onSuccess && onSuccess();
                pool.deleteCbk(id);
                break;
            }
        }
    });
    return new Capture();
}

export default initCapture;

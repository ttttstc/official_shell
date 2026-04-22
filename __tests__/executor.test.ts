import * as path from 'path';
import * as os from 'os';
import { execute } from '../src/executor';

describe('executor.execute', () => {
  it('cwd 不存在时返回 exit 1 且不调起子进程', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const bogus = path.join(os.tmpdir(), 'this-dir-does-not-exist-' + Date.now());

    const result = await execute('node', ['-e', 'process.exit(0)'], bogus);

    expect(result.exitCode).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Working directory does not exist')
    );
    errSpy.mockRestore();
  });

  it('cwd 为空时使用 process.cwd 正常执行', async () => {
    const result = await execute('node', ['-e', 'process.exit(0)']);
    expect(result.exitCode).toBe(0);
  });
});

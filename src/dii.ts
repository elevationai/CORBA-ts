/**
 * Dynamic Invocation Interface (DII) Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { ParameterMode } from "./object.ts";
import { Context } from "./context.ts";
import { TypeCode } from "./typecode.ts";

/**
 * Request interface
 */
export interface Request {
  /**
   * Add a named parameter to the request
   */
  add_named_in_arg(name: string, value: unknown, type: TypeCode): unknown;

  /**
   * Add an unnamed input parameter to the request
   */
  add_in_arg(value: unknown, type: TypeCode): unknown;

  /**
   * Add an unnamed output parameter to the request
   */
  add_out_arg(type: TypeCode): unknown;

  /**
   * Add an unnamed input/output parameter to the request
   */
  add_inout_arg(value: unknown, type: TypeCode): unknown;

  /**
   * Set the return type for the request
   */
  set_return_type(tc: TypeCode): void;

  /**
   * Get the return value from the request
   */
  return_value(): unknown;

  /**
   * Get a specific parameter value
   */
  arguments(): unknown[];

  /**
   * Get a specific parameter value
   */
  get_arg(index: number): unknown;

  /**
   * Get the exception of the request if any
   */
  get_exception(): unknown;

  /**
   * Set the context for the request
   */
  ctx(context: Context): void;

  /**
   * Get the context for the request
   */
  get_ctx(): Context | null;

  /**
   * Get the target object
   */
  target(): object;

  /**
   * Get the operation name
   */
  operation(): string;

  /**
   * Send the request and wait for the response
   */
  invoke(): Promise<void>;

  /**
   * Send the request asynchronously
   */
  send_deferred(): void;

  /**
   * Send the request as a one-way operation
   */
  send_oneway(): void;

  /**
   * Poll to see if the response has arrived
   */
  poll_response(): boolean;

  /**
   * Get the response
   */
  get_response(): void;
}

/**
 * Parameter placeholder for DII
 */
export class Parameter {
  private _value: unknown;
  private _type: TypeCode;
  private _mode: ParameterMode;
  private _name: string;

  constructor(
    value: unknown,
    type: TypeCode,
    mode: ParameterMode,
    name: string = "",
  ) {
    this._value = value;
    this._type = type;
    this._mode = mode;
    this._name = name;
  }

  /**
   * Get the parameter value
   */
  get value(): unknown {
    return this._value;
  }

  /**
   * Set the parameter value
   */
  set value(value: unknown) {
    this._value = value;
  }

  /**
   * Get the parameter type
   */
  get type(): TypeCode {
    return this._type;
  }

  /**
   * Get the parameter mode
   */
  get mode(): ParameterMode {
    return this._mode;
  }

  /**
   * Get the parameter name
   */
  get name(): string {
    return this._name;
  }
}

/**
 * DII Request implementation
 */
export class RequestImpl implements Request {
  private _target: object;
  private _operation: string;
  private _params: Parameter[] = [];
  private _return_type: TypeCode | null = null;
  private _return_value: unknown = null;
  private _context: Context | null = null;
  private _exception: unknown = null;
  private _response_received: boolean = false;

  constructor(target: object, operation: string) {
    this._target = target;
    this._operation = operation;
  }

  add_named_in_arg(name: string, value: unknown, type: TypeCode): unknown {
    const param = new Parameter(value, type, ParameterMode.PARAM_IN, name);
    this._params.push(param);
    return value;
  }

  add_in_arg(value: unknown, type: TypeCode): unknown {
    const param = new Parameter(value, type, ParameterMode.PARAM_IN);
    this._params.push(param);
    return value;
  }

  add_out_arg(type: TypeCode): unknown {
    const param = new Parameter(null, type, ParameterMode.PARAM_OUT);
    this._params.push(param);
    return null;
  }

  add_inout_arg(value: unknown, type: TypeCode): unknown {
    const param = new Parameter(value, type, ParameterMode.PARAM_INOUT);
    this._params.push(param);
    return value;
  }

  set_return_type(tc: TypeCode): void {
    this._return_type = tc;
  }

  get_return_type(): TypeCode | null {
    return this._return_type;
  }

  return_value(): unknown {
    return this._return_value;
  }

  arguments(): unknown[] {
    return this._params.map((p) => p.value);
  }

  get_arg(index: number): unknown {
    if (index < 0 || index >= this._params.length) {
      throw new CORBA.BAD_PARAM(`Parameter index ${index} out of range`);
    }
    return this._params[index].value;
  }

  get_exception(): unknown {
    return this._exception;
  }

  ctx(context: Context): void {
    this._context = context;
  }

  get_ctx(): Context | null {
    return this._context;
  }

  target(): object {
    return this._target;
  }

  operation(): string {
    return this._operation;
  }

  async invoke(): Promise<void> {
    // Reset any previous response state
    this._response_received = false;
    this._return_value = null;
    this._exception = null;

    try {
      // Import CDR encoder and TypeCode encoder
      const { CDROutputStream } = await import("./core/cdr/encoder.ts");
      const { encodeWithTypeCode } = await import("./core/cdr/typecode-encoder.ts");

      // Create CDR output stream for request body
      const cdr = new CDROutputStream(1024, false); // Big-endian by default

      // Encode each IN and INOUT parameter using its TypeCode
      for (const param of this._params) {
        if (param.mode === ParameterMode.PARAM_IN || param.mode === ParameterMode.PARAM_INOUT) {
          if (param.type) {
            encodeWithTypeCode(cdr, param.value, param.type);
          }
          else {
            // Fallback for parameters without TypeCode
            if (typeof param.value === "string") {
              cdr.writeString(param.value);
            }
            else if (typeof param.value === "number") {
              cdr.writeLong(Math.floor(param.value));
            }
            else if (typeof param.value === "boolean") {
              cdr.writeBoolean(param.value);
            }
            else {
              cdr.writeString(JSON.stringify(param.value));
            }
          }
        }
      }

      // Get the encoded buffer
      const requestBody = cdr.getBuffer();

      // Get the ORB instance and invoke with encoded buffer
      const { ORB_instance } = await import("./orb.ts");
      const orb = ORB_instance();

      // Invoke through the ORB with pre-encoded buffer
      const result = await orb.invokeWithEncodedArgs(
        this._target as CORBA.ObjectRef,
        this._operation,
        requestBody,
      );

      // Set the return value
      this._return_value = result.returnValue;

      // Decode output parameters from the reply buffer
      const { CDRInputStream } = await import("./core/cdr/decoder.ts");
      const { decodeWithTypeCode } = await import("./core/cdr/typecode-decoder.ts");

      // Create CDR input stream from the output buffer
      // Note: We need to skip past the return value that was already read
      // Use the endianness from the reply (passed through the result)
      const outCdr = new CDRInputStream(result.outputBuffer, result.isLittleEndian);

      // Skip the return value (assuming it's a long for now)
      try {
        outCdr.readLong(); // Skip return value
      }
      catch {
        // If can't read as long, reset position
      }

      // Decode output parameters in order
      for (const param of this._params) {
        if (param.mode === ParameterMode.PARAM_OUT || param.mode === ParameterMode.PARAM_INOUT) {
          if (param.type) {
            try {
              // Decode the parameter value based on its TypeCode
              param.value = decodeWithTypeCode(outCdr, param.type);
            }
            catch (error) {
              // Log the error and throw - don't use dummy values
              console.error(`Failed to decode output parameter: ${error}`);
              throw new CORBA.MARSHAL(`Failed to decode output parameter: ${error}`);
            }
          }
          else {
            // No type info - this is a programming error
            throw new CORBA.BAD_PARAM("Output parameter has no TypeCode");
          }
        }
      }

      this._response_received = true;
    }
    catch (e) {
      this._exception = e;
      this._response_received = true;
      throw e;
    }
  }

  send_deferred(): void {
    // Reset any previous response state
    this._response_received = false;
    this._return_value = null;
    this._exception = null;

    // TODO: Implement proper async GIOP invocation
    // This would use GIOP to invoke the operation asynchronously
    throw new CORBA.NO_IMPLEMENT("Deferred invocation not yet implemented");
  }

  send_oneway(): void {
    // Reset any previous response state
    this._response_received = true; // One-way calls don't have responses
    this._return_value = null;
    this._exception = null;

    // In a real implementation, this would use GIOP to send a one-way request
    // For one-way calls, we don't wait for or expect a response
  }

  poll_response(): boolean {
    return this._response_received;
  }

  get_response(): void {
    if (!this._response_received) {
      // In a real implementation, this would block until the response is received
      throw new CORBA.BAD_PARAM("Response not yet available");
    }

    if (this._exception) {
      throw this._exception;
    }
  }
}

/**
 * Create a request on an object
 */
export function create_request(
  target: object,
  operation: string,
  _arg_list: unknown[] = [],
  _result: unknown = null,
  ctx: Context | null = null,
  return_type: TypeCode | null = null,
): Request {
  const request = new RequestImpl(target, operation);

  if (ctx) {
    request.ctx(ctx);
  }

  if (return_type) {
    request.set_return_type(return_type);
  }

  // In a real implementation, we would add arguments from arg_list

  return request;
}
